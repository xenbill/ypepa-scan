using Microsoft.AspNetCore.StaticFiles;
using Mis.YpepaScan.Web.Imaging;

namespace Mis.YpepaScan.Web.Endpoints;

/// <summary>
/// Serves the tile cache (DZI descriptors + tiles, thumbnails)
/// as an authorized endpoint instead of anonymous static files, so drawings
/// are only visible to logged-in users. The browser sends the auth cookie on
/// these requests automatically (img, iframe, OpenSeadragon tile loads).
/// </summary>
public static class TileEndpoints
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new()
    {
        Mappings = { [".dzi"] = "application/xml" },
    };

    public static IEndpointRouteBuilder MapTileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/tiles/{**path}", (string path, HttpContext http, TileService tiles) =>
        {
            var root = Path.GetFullPath(tiles.CacheDir);
            var full = Path.GetFullPath(Path.Combine(root, path));
            // Reject anything that escapes the cache dir (../ tricks).
            if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return Results.NotFound();
            if (!File.Exists(full))
                return Results.NotFound();

            // A drawing's tiles/dzi/thumb never change for a given id (eviction
            // regenerates identical content), so let the browser keep them for a
            // year and skip re-requesting on every view. "private": authorized
            // content must not land in shared proxy caches.
            http.Response.Headers.CacheControl = "private, max-age=31536000, immutable";

            if (!ContentTypes.TryGetContentType(full, out var contentType))
                contentType = "application/octet-stream";
            return Results.File(full, contentType, enableRangeProcessing: true,
                lastModified: File.GetLastWriteTimeUtc(full));
        }).RequireAuthorization();

        return app;
    }
}
