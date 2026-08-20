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

            // Tiles/dzi/thumb are immutable per pyramid build — TileService stamps
            // a ?v=<build time> on the URLs it hands out, so a rebuilt pyramid gets
            // fresh URLs and the year-long cache below can never serve stale tiles.
            // "private": authorized content must not land in shared proxy caches.
            http.Response.Headers.CacheControl = "private, max-age=31536000, immutable";

            if (!ContentTypes.TryGetContentType(full, out var contentType))
                contentType = "application/octet-stream";
            return Results.File(full, contentType, enableRangeProcessing: true,
                lastModified: File.GetLastWriteTimeUtc(full));
        }).RequireAuthorization();

        return app;
    }
}
