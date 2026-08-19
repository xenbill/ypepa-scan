using System.Collections.Concurrent;
using System.Text.Json;
using NetVips;
using Sxedia.Web.Data;

namespace Sxedia.Web.Imaging;

public record ViewInfo(string Type, string Url, string ThumbUrl, int? Width, int? Height);

/// <summary>
/// Prepares drawings for in-browser viewing. TIFFs (and other images) become
/// Deep Zoom (DZI) tile pyramids via libvips — the only sane way to show a
/// 10000x15000 scan in a browser. Pyramids are cached on disk per drawing id;
/// generation runs once, ever. PDFs never touch the cache: browsers render them
/// natively, so they are streamed straight from the store (with Range support).
/// </summary>
public sealed class TileService(IConfiguration cfg, IWebHostEnvironment env, ILogger<TileService> log)
{
    public string CacheDir { get; } = string.IsNullOrWhiteSpace(cfg["Cache:Dir"])
        ? Path.Combine(env.ContentRootPath, "tile-cache")
        : cfg["Cache:Dir"]!;

    private readonly long _maxBytes = (cfg.GetValue<long?>("Cache:MaxMegabytes") ?? 500) * 1024 * 1024;
    private readonly ConcurrentDictionary<long, SemaphoreSlim> _locks = new();
    private int _evicting;

    private string Dir(long id) => Path.Combine(CacheDir, id.ToString());
    private string MetaPath(long id) => Path.Combine(Dir(id), "meta.json");

    public async Task<ViewInfo?> EnsureAsync(long id, IDrawingStore store, CancellationToken ct = default)
    {
        if (ReadMeta(id) is { } cached)
        {
            if (cached.Type != "pdf")
            {
                Touch(id); // record use for LRU eviction
                return cached;
            }
            // Legacy entry from when PDFs were copied into the cache; drop it and fall through.
            try { Directory.Delete(Dir(id), recursive: true); } catch { /* best effort */ }
        }

        var gate = _locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (ReadMeta(id) is { } cachedAfterWait)
                return cachedAfterWait;

            var opened = await store.OpenFileAsync(id, ct);
            if (opened is null) return null;
            await using var src = opened.Value.Stream;

            // Sniff from the store stream itself (seekable in both stores) so PDFs
            // are decided without ever being copied to disk.
            var head = new byte[FileTypes.HeadLength];
            var n = await src.ReadAsync(head, ct);
            var type = FileTypes.Sniff(head.AsSpan(0, n));
            if (!FileTypes.IsSupported(type))
            {
                log.LogWarning("Drawing {Id}: unsupported file type '{Type}', cannot view", id, type);
                throw new UnsupportedFileException(type, FileTypes.UnsupportedMessage(type));
            }
            if (type == "pdf")
            {
                log.LogInformation("Drawing {Id}: PDF, served directly from the store", id);
                return new ViewInfo("pdf", $"/api/drawings/{id}/file?inline=true", "", null, null);
            }
            src.Seek(0, SeekOrigin.Begin);

            Directory.CreateDirectory(Dir(id));
            var originalPath = Path.Combine(Dir(id), "original.bin");
            await using (var dst = new FileStream(originalPath, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20, useAsync: true))
                await src.CopyToAsync(dst, ct);

            ViewInfo info;
            try
            {
                info = PrepareDzi(id, originalPath);
            }
            catch (VipsException e)
            {
                // Right magic number, unreadable content (truncated/corrupt scan).
                if (File.Exists(originalPath)) File.Delete(originalPath);
                log.LogWarning(e, "Drawing {Id}: {Type} file could not be decoded", id, type);
                throw new UnsupportedFileException(type,
                    $"Το αρχείο ({FileTypes.Label(type)}) δεν μπορεί να αναγνωσθεί — πιθανόν κατεστραμμένο ή ελλιπές.");
            }

            // The blob copy was only needed as vips input; keeping it would roughly
            // double the cache footprint.
            File.Delete(originalPath);

            // Atomic publish: readers must never see a half-written meta.json.
            var tmp = MetaPath(id) + ".tmp";
            await File.WriteAllTextAsync(tmp, JsonSerializer.Serialize(info), ct);
            File.Move(tmp, MetaPath(id), overwrite: true);
            _ = Task.Run(() => EvictIfOverCap(keepId: id));
            return info;
        }
        finally
        {
            gate.Release();
        }
    }

    private void Touch(long id)
    {
        try { File.SetLastWriteTimeUtc(MetaPath(id), DateTime.UtcNow); } catch { /* best effort */ }
    }

    /// <summary>
    /// Keeps the cache under Cache:MaxMegabytes by deleting the least recently
    /// used drawing folders (LRU = meta.json write time, refreshed on every view).
    /// The drawing that was just generated is never evicted.
    /// </summary>
    private void EvictIfOverCap(long keepId)
    {
        if (Interlocked.Exchange(ref _evicting, 1) == 1) return;
        try
        {
            var entries = Directory.EnumerateDirectories(CacheDir)
                .Select(d =>
                {
                    long size = 0;
                    try { size = new DirectoryInfo(d).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length); }
                    catch { /* folder may be mid-generation or mid-delete */ }
                    var meta = Path.Combine(d, "meta.json");
                    var hasMeta = File.Exists(meta);
                    var lastUse = hasMeta ? File.GetLastWriteTimeUtc(meta) : Directory.GetLastWriteTimeUtc(d);
                    return (Dir: d, Size: size, LastUse: lastUse, HasMeta: hasMeta);
                })
                // No meta.json = generation in progress; leave it alone unless it's a
                // stale orphan from a crash (folders normally get meta within seconds).
                .Where(e => e.HasMeta || DateTime.UtcNow - e.LastUse > TimeSpan.FromHours(1))
                .ToList();

            var total = entries.Sum(e => e.Size);
            if (total <= _maxBytes) return;

            foreach (var e in entries.OrderBy(e => e.LastUse))
            {
                if (total <= _maxBytes) break;
                if (Path.GetFileName(e.Dir) == keepId.ToString()) continue;
                try
                {
                    // Unpublish first: if the recursive delete fails half-way (a tile
                    // being served is locked on Windows), the entry must not look
                    // "ready" with tiles missing. No meta.json => treated as a miss
                    // and regenerated; leftovers are swept as orphans later.
                    var meta = Path.Combine(e.Dir, "meta.json");
                    if (File.Exists(meta)) File.Delete(meta);
                    Directory.Delete(e.Dir, recursive: true);
                    total -= e.Size;
                    log.LogInformation("Tile cache: evicted drawing {Dir} ({Mb:0.0} MB, last used {LastUse:u})",
                        Path.GetFileName(e.Dir), e.Size / 1048576.0, e.LastUse);
                }
                catch (Exception ex)
                {
                    // Files may be open (tiles being served right now) — skip, retry next round.
                    log.LogDebug(ex, "Tile cache: could not evict {Dir}", e.Dir);
                }
            }
        }
        finally
        {
            Interlocked.Exchange(ref _evicting, 0);
        }
    }

    private ViewInfo? ReadMeta(long id)
    {
        // Concurrent eviction can remove the file between Exists and Read;
        // any failure is just a cache miss and the pyramid regenerates.
        try
        {
            return File.Exists(MetaPath(id))
                ? JsonSerializer.Deserialize<ViewInfo>(File.ReadAllText(MetaPath(id)))
                : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    private ViewInfo PrepareDzi(long id, string originalPath)
    {
        using var img = Image.NewFromFile(originalPath, access: Enums.Access.Sequential);
        var (w, h) = (img.Width, img.Height);
        log.LogInformation("Drawing {Id}: {W}x{H} image, generating DZI pyramid...", id, w, h);

        // img.dzi + img_files/{level}/{x}_{y}.jpg under the cache dir
        img.Dzsave(Path.Combine(Dir(id), "img"), tileSize: 256, overlap: 1, suffix: ".jpg[Q=85]");

        // Thumbnail for lists / side panel (decodes downsampled — cheap with vips)
        using var thumb = Image.Thumbnail(originalPath, 480);
        thumb.Jpegsave(Path.Combine(Dir(id), "thumb.jpg"), q: 80);

        log.LogInformation("Drawing {Id}: pyramid ready", id);
        return new ViewInfo("dzi", $"/tiles/{id}/img.dzi", $"/tiles/{id}/thumb.jpg", w, h);
    }
}
