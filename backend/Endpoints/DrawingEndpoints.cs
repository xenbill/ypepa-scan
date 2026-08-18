using System.Security.Claims;
using Serilog;
using Sxedia.Web.Data;
using Sxedia.Web.Imaging;

namespace Sxedia.Web.Endpoints;

/// <summary>Drawing search, metadata, viewing, download, import, update and soft delete.</summary>
public static class DrawingEndpoints
{
    public static RouteGroupBuilder MapDrawingEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/stats", (IDrawingStore store, CancellationToken ct) => store.GetStatsAsync(ct));

        api.MapGet("/drawings", (IDrawingStore store, CancellationToken ct,
            string? q, long? kathg, long? ypokat, long? eidos, long? xoros, long? hstr,
            DateTime? insFrom, DateTime? insTo,
            string? sortBy, string? sortDir, int page = 1, int pageSize = 20)
            => store.SearchAsync(new SearchParams(q, kathg, ypokat, eidos, xoros, hstr, insFrom, insTo, sortBy, sortDir, page, pageSize), ct));

        api.MapGet("/drawings/{id:long}", async (long id, IDrawingStore store, CancellationToken ct)
            => await store.GetAsync(id, ct) is { } row ? Results.Ok(row) : Results.NotFound());

        // Prepares (once) and describes how to view a drawing: DZI pyramid or native PDF.
        api.MapGet("/drawings/{id:long}/view", async (long id, IDrawingStore store, TileService tileSvc, CancellationToken ct)
            => await tileSvc.EnsureAsync(id, store, ct) is { } info ? Results.Ok(info) : Results.NotFound());

        // Original file download, streamed straight from the store.
        api.MapGet("/drawings/{id:long}/file", DownloadFile);

        api.MapPost("/drawings", Import);

        api.MapPut("/drawings/{id:long}", async (long id, ImportMeta meta, ClaimsPrincipal user,
            IDrawingStore store, CancellationToken ct) =>
        {
            if (!await store.UpdateAsync(id, meta, ct))
                return Results.NotFound();
            Log.Information("Drawing {Id} metadata updated by {User}", id, user.Identity?.Name);
            return Results.Ok();
        });

        api.MapDelete("/drawings/{id:long}", async (long id, ClaimsPrincipal user,
            IDrawingStore store, CancellationToken ct) =>
        {
            if (!await store.SoftDeleteAsync(id, ct))
                return Results.NotFound();
            Log.Warning("Drawing {Id} soft-deleted by {User}", id, user.Identity?.Name);
            return Results.Ok();
        });

        return api;
    }

    private static async Task<IResult> DownloadFile(long id, IDrawingStore store, CancellationToken ct)
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
    }

    private static async Task<IResult> Import(HttpRequest req, ClaimsPrincipal user, IDrawingStore store, CancellationToken ct)
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
            L("hstrId"), user.Identity?.Name); // USER_INS = logged-in user, never client-supplied

        await using var stream = file.OpenReadStream();
        var id = await store.ImportAsync(meta, stream, file.Length, ct);
        Log.Information("Drawing {Id} imported by {User} ({FileName}, {Size} bytes)",
            id, user.Identity?.Name, file.FileName, file.Length);
        return Results.Ok(new { id });
    }
}
