using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.FileProviders;
using Serilog;
using Sxedia.Web.Auth;
using Sxedia.Web.Data;
using Sxedia.Web.Imaging;
using Sxedia.Web.Utils;

Log.Logger = SerilogInstaller.CreateLogger();

try
{
    Log.Information("Starting Sxedia (Σχεδιοθήκη) API");

    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog();

    builder.Services.AddSingleton<TileService>();
    var mode = builder.Configuration["Storage:Mode"] ?? "Demo";
    if (mode.Equals("Oracle", StringComparison.OrdinalIgnoreCase))
        builder.Services.AddSingleton<IDrawingStore, OracleDrawingStore>();
    else
        builder.Services.AddSingleton<IDrawingStore, DemoDrawingStore>();

    builder.Services.AddJwtAuthentication(builder.Configuration);

    // Imports can be large scans
    builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 500L * 1024 * 1024);
    builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 500L * 1024 * 1024);

    var app = builder.Build();

    app.UseSerilogRequestLogging();

    app.UseDefaultFiles();
    app.UseStaticFiles();

    // Tile cache (DZI pyramids, thumbs, cached PDFs) served as static content
    var tiles = app.Services.GetRequiredService<TileService>();
    Directory.CreateDirectory(tiles.CacheDir);
    var tileTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
    tileTypes.Mappings[".dzi"] = "application/xml";
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(tiles.CacheDir),
        RequestPath = "/tiles",
        ContentTypeProvider = tileTypes,
    });

    app.UseAuthentication();
    app.UseAuthorization();

    app.MapAuthEndpoints();

    // ---- data (login required) ----------------------------------------------
    var data = app.MapGroup("/api").RequireAuthorization();

    data.MapGet("/lookups", (IDrawingStore store, CancellationToken ct) => store.GetLookupsAsync(ct));
    data.MapGet("/stats", (IDrawingStore store, CancellationToken ct) => store.GetStatsAsync(ct));

    data.MapGet("/drawings", (IDrawingStore store, CancellationToken ct,
        string? q, long? kathg, long? ypokat, long? eidos, long? xoros, long? hstr,
        DateTime? insFrom, DateTime? insTo,
        string? sortBy, string? sortDir, int page = 1, int pageSize = 20)
        => store.SearchAsync(new SearchParams(q, kathg, ypokat, eidos, xoros, hstr, insFrom, insTo, sortBy, sortDir, page, pageSize), ct));

    data.MapGet("/drawings/{id:long}", async (long id, IDrawingStore store, CancellationToken ct)
        => await store.GetAsync(id, ct) is { } row ? Results.Ok(row) : Results.NotFound());

    // Prepares (once) and describes how to view a drawing: DZI pyramid or native PDF.
    data.MapGet("/drawings/{id:long}/view", async (long id, IDrawingStore store, TileService tileSvc, CancellationToken ct)
        => await tileSvc.EnsureAsync(id, store, ct) is { } info ? Results.Ok(info) : Results.NotFound());

    // Original file download, streamed straight from the store.
    data.MapGet("/drawings/{id:long}/file", async (long id, IDrawingStore store, CancellationToken ct) =>
    {
        var opened = await store.OpenFileAsync(id, ct);
        if (opened is null) return Results.NotFound();
        var row = await store.GetAsync(id, ct);
        var head = new byte[4];
        _ = await opened.Value.Stream.ReadAsync(head.AsMemory(0, 4), ct);
        opened.Value.Stream.Seek(0, SeekOrigin.Begin);
        var (ext, mime) = head switch
        {
            [0x25, 0x50, 0x44, 0x46] => (".pdf", "application/pdf"),
            [0xFF, 0xD8, ..] => (".jpg", "image/jpeg"),
            [0x89, 0x50, 0x4E, 0x47] => (".png", "image/png"),
            _ => (".tif", "image/tiff"),
        };
        var name = (row?.ArithmosSxed is { Length: > 0 } a ? a : $"sxedio-{id}") + ext;
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        return Results.Stream(opened.Value.Stream, mime, name, enableRangeProcessing: false);
    });

    data.MapPost("/drawings", async (HttpRequest req, System.Security.Claims.ClaimsPrincipal user,
        IDrawingStore store, CancellationToken ct) =>
    {
        var form = await req.ReadFormAsync(ct);
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "Δεν επιλέχθηκε αρχείο." });

        string? S(string key) => form.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v.ToString() : null;
        long? L(string key) => long.TryParse(S(key), out var v) ? v : null;
        DateTime? D(string key) => DateTime.TryParse(S(key), out var v) ? v : null;

        var meta = new ImportMeta(S("kodikosErg"), S("arithmosSxed"), S("titlosErg"), S("titlosSxed"),
            S("perigrafhSxed"), S("perigrafhErg"), D("hmer"), L("eidosId"), L("kathgId"), L("ypokatId"), L("xorosId"),
            L("hstrId"), user.Identity?.Name);

        await using var stream = file.OpenReadStream();
        var id = await store.ImportAsync(meta, stream, file.Length, ct);
        Log.Information("Drawing {Id} imported by {User} ({FileName}, {Size} bytes)",
            id, user.Identity?.Name, file.FileName, file.Length);
        return Results.Ok(new { id });
    });

    data.MapPut("/drawings/{id:long}", async (long id, ImportMeta meta, System.Security.Claims.ClaimsPrincipal user,
        IDrawingStore store, CancellationToken ct) =>
    {
        if (!await store.UpdateAsync(id, meta, ct))
            return Results.NotFound();
        Log.Information("Drawing {Id} metadata updated by {User}", id, user.Identity?.Name);
        return Results.Ok();
    });

    data.MapDelete("/drawings/{id:long}", async (long id, System.Security.Claims.ClaimsPrincipal user,
        IDrawingStore store, CancellationToken ct) =>
    {
        if (!await store.SoftDeleteAsync(id, ct))
            return Results.NotFound();
        Log.Warning("Drawing {Id} soft-deleted by {User}", id, user.Identity?.Name);
        return Results.Ok();
    });

    // ---- lookup administration (Μονάδες excluded: external COMMON data) ------
    data.MapPost("/lookups/{type}", async (string type, LookupEditDto dto, IDrawingStore store, CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest(new { error = "Η περιγραφή είναι υποχρεωτική." });
        var id = await store.AddLookupAsync(type, dto.Name.Trim(), dto.ParentId, ct);
        return Results.Ok(new { id });
    });

    data.MapPut("/lookups/{type}/{id:long}", async (string type, long id, LookupEditDto dto, IDrawingStore store, CancellationToken ct) =>
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest(new { error = "Η περιγραφή είναι υποχρεωτική." });
        return await store.UpdateLookupAsync(type, id, dto.Name.Trim(), dto.ParentId, ct)
            ? Results.Ok() : Results.NotFound();
    });

    data.MapDelete("/lookups/{type}/{id:long}", async (string type, long id, IDrawingStore store, CancellationToken ct) =>
    {
        try
        {
            return await store.DeleteLookupAsync(type, id, ct) ? Results.Ok() : Results.NotFound();
        }
        catch (LookupInUseException ex)
        {
            return Results.Conflict(new { error = ex.Message });
        }
    });

    // SPA fallback so router URLs (/login, /sxedio/123) work on refresh/deep link.
    app.MapFallbackToFile("index.html");

    app.Run();
    Log.Information("Sxedia API shut down gracefully");
}
catch (Exception ex)
{
    Log.Fatal(ex, "Sxedia API terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}

internal sealed record LookupEditDto(string Name, long? ParentId);
