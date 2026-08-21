using System.Security.Claims;
using Serilog;
using Mis.YpepaScan.Web.Auth;
using Mis.YpepaScan.Web.Data;
using Mis.YpepaScan.Web.Imaging;

namespace Mis.YpepaScan.Web.Endpoints;

/// <summary>Drawing search, metadata, viewing, download, import, update and soft delete.</summary>
public static class DrawingEndpoints
{
    public static RouteGroupBuilder MapDrawingEndpoints(this RouteGroupBuilder api)
    {
        // What the import UI may offer — single source of truth for accepted types
        // (FileTypes + the CAD feature flag); the SPA builds its file pickers and
        // manual/help content from this instead of hardcoding the list.
        api.MapGet("/config", (CadRaster cad) => new { cadEnabled = cad.Enabled, accept = FileTypes.Accept(cad.Enabled) });

        api.MapGet("/stats", (IDrawingStore store, CancellationToken ct) => store.GetStatsAsync(ct));

        api.MapGet("/drawings", (IDrawingStore store, CancellationToken ct,
            string? q, long? kathg, long? ypokat, long? eidos, long? xoros, long? hstr,
            DateTime? insFrom, DateTime? insTo,
            string? sortBy, string? sortDir, int page = 1, int pageSize = 20)
            => store.SearchAsync(new SearchParams(q, kathg, ypokat, eidos, xoros, hstr, insFrom, insTo, sortBy, sortDir, page, pageSize), ct));

        api.MapGet("/drawings/{id:long}", async (long id, IDrawingStore store, CancellationToken ct)
            => await store.GetAsync(id, ct) is { } row ? Results.Ok(row) : Results.NotFound());

        // Prepares (once) and describes how to view a drawing: DZI pyramid or native PDF.
        api.MapGet("/drawings/{id:long}/view", async (long id, IDrawingStore store, TileService tileSvc, CancellationToken ct) =>
        {
            try
            {
                return await tileSvc.EnsureAsync(id, store, ct) is { } info ? Results.Ok(info) : Results.NotFound();
            }
            catch (UnsupportedFileException e)
            {
                return Results.Json(new { error = e.Message, fileType = e.FileType }, statusCode: StatusCodes.Status415UnsupportedMediaType);
            }
        });

        // Original file, streamed straight from the store. ?inline=true (used by the
        // viewer for PDFs) serves it for display instead of as an attachment.
        // Inline (a PDF shown in the viewer) is viewing; the attachment download is what
        // the legacy "Εκτύπωση" right covers — the web app prints only via the downloaded file.
        api.MapGet("/drawings/{id:long}/file", (long id, ClaimsPrincipal user, IDrawingStore store, CancellationToken ct, bool inline = false)
            => inline || AppRights.Has(user, AppRights.Print)
                ? DownloadFile(id, store, ct, inline)
                : Task.FromResult(Results.Forbid()));

        api.MapPost("/drawings", Import).RequireAuthorization(AppRights.Scan);

        api.MapPut("/drawings/{id:long}", async (long id, ImportMeta meta, ClaimsPrincipal user,
            IDrawingStore store, CancellationToken ct) =>
        {
            if (!await store.UpdateAsync(id, meta, ct))
                return Results.NotFound();
            Log.Information("Drawing {Id} metadata updated by {User}", id, user.Identity?.Name);
            return Results.Ok();
        }).RequireAuthorization(AppRights.Edit);

        api.MapDelete("/drawings/{id:long}", async (long id, ClaimsPrincipal user,
            IDrawingStore store, TileService tileSvc, CancellationToken ct) =>
        {
            if (!await store.DeleteAsync(id, user.Identity?.Name, ct))
                return Results.NotFound();
            // No ct: once the row is archived, the cached tiles must go even if the
            // client disconnects — otherwise the pyramid stays servable until LRU.
            await tileSvc.PurgeAsync(id);
            Log.Warning("Drawing {Id} deleted (moved to C16PE_SXEDIO_DELETED) by {User}", id, user.Identity?.Name);
            return Results.Ok();
        }).RequireAuthorization(AppRights.Edit);

        return api;
    }

    private static async Task<IResult> DownloadFile(long id, IDrawingStore store, CancellationToken ct, bool inline = false)
    {
        var opened = await store.OpenFileAsync(id, ct);
        if (opened is null) return Results.NotFound();
        var row = await store.GetAsync(id, ct);
        var head = new byte[FileTypes.HeadLength];
        var n = await opened.Value.Stream.ReadAsync(head, ct);
        opened.Value.Stream.Seek(0, SeekOrigin.Begin);
        var (ext, mime) = FileTypes.Resolve(FileTypes.Sniff(head.AsSpan(0, n)), opened.Value.Stream) switch
        {
            "pdf" => (".pdf", "application/pdf"),
            "tiff" => (".tif", "image/tiff"),
            "jpeg" => (".jpg", "image/jpeg"),
            "png" => (".png", "image/png"),
            "gif" => (".gif", "image/gif"),
            "bmp" => (".bmp", "image/bmp"),
            "webp" => (".webp", "image/webp"),
            "dwg" => (".dwg", "application/acad"),
            "dxf" => (".dxf", "image/vnd.dxf"),
            "dgn" => (".dgn", "image/vnd.dgn"),
            "dwf" => (".dwf", "model/vnd.dwf"),
            "dwfx" => (".dwfx", "model/vnd.dwfx+xps"),
            "zip" => (".zip", "application/zip"),
            _ => (".bin", "application/octet-stream"),
        };
        // Range support matters for inline PDFs: the browser's PDF viewer fetches pages
        // on demand instead of downloading the whole scan first. Both store streams
        // are seekable (OracleBlob = random-access LOB reads), so this costs nothing.
        if (inline)
            return Results.Stream(opened.Value.Stream, mime, enableRangeProcessing: true);
        var name = (row?.ArithmosSxed is { Length: > 0 } a ? a : $"drawing-{id}") + ext;
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        return Results.Stream(opened.Value.Stream, mime, name, enableRangeProcessing: true);
    }

    private static async Task<IResult> Import(HttpRequest req, ClaimsPrincipal user, IDrawingStore store, CadRaster cad, CancellationToken ct)
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
            L("hstrId"), user.Identity?.Name, // USER_INS = logged-in user, never client-supplied
            Maziki: S("maziki") is "1" or "true"); // set by the mass-import dialog (one request per file)

        await using var stream = file.OpenReadStream();
        // Reject by content, not by extension/Content-Type (both are client-supplied and unreliable).
        var head = new byte[FileTypes.HeadLength];
        var n = await stream.ReadAsync(head, ct);
        var type = FileTypes.Resolve(FileTypes.Sniff(head.AsSpan(0, n)), stream);
        if (!FileTypes.IsSupported(type) || (FileTypes.IsCad(type) && !cad.Enabled))
        {
            Log.Information("Import rejected for {User}: {FileName} sniffed as '{Type}'", user.Identity?.Name, file.FileName, type);
            return Results.BadRequest(new { error = FileTypes.UnsupportedMessage(type, cad.Enabled), fileType = type });
        }
        stream.Seek(0, SeekOrigin.Begin); // form files are buffered => seekable
        var id = await store.ImportAsync(meta, stream, file.Length, ct);
        Log.Information("Drawing {Id} imported by {User} ({FileName}, {Size} bytes)",
            id, user.Identity?.Name, file.FileName, file.Length);
        return Results.Ok(new { id });
    }
}
