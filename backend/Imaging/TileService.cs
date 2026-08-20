using System.Collections.Concurrent;
using System.Text.Json;
using ImageMagick;
using NetVips;
using Mis.YpepaScan.Web.Data;

namespace Mis.YpepaScan.Web.Imaging;

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
                try
                {
                    info = PrepareDzi(id, originalPath);
                }
                catch (VipsException e)
                {
                    // libvips lacks some legacy codecs — notably TIFFs with old-style
                    // JPEG compression (tag 6) from 1990s-era scanners. ImageMagick
                    // reads those: transcode to a plain TIFF and retry the pyramid.
                    log.LogWarning("Drawing {Id}: libvips could not decode the {Type} file ({Reason}); retrying via ImageMagick",
                        id, type, FirstLine(e.Message));
                    var convertedPath = Path.Combine(Dir(id), "converted.tif");
                    try
                    {
                        Transcode(originalPath, convertedPath);
                        info = PrepareDzi(id, convertedPath);
                        log.LogInformation("Drawing {Id}: decoded via the ImageMagick fallback", id);
                    }
                    catch (Exception inner) when (inner is VipsException or MagickException)
                    {
                        // Unreadable by both decoders: genuinely corrupt/truncated.
                        log.LogWarning(inner, "Drawing {Id}: {Type} file could not be decoded (fallback failed too)", id, type);
                        // Log what the file claims to be, so undecodable files on
                        // servers we cannot pull samples from stay diagnosable.
                        if (type == "tiff")
                            log.LogWarning("Drawing {Id}: TIFF diagnostics: {Diag}", id, TiffDiag.Describe(originalPath));
                        throw new UnsupportedFileException(type,
                            $"Το αρχείο ({FileTypes.Label(type)}) δεν μπορεί να αναγνωσθεί — πιθανόν κατεστραμμένο ή ελλιπές.");
                    }
                    finally
                    {
                        if (File.Exists(convertedPath)) File.Delete(convertedPath);
                    }
                }
            }
            finally
            {
                // The blob copy (and any converted temp) was only needed as decode
                // input; keeping it would roughly double the cache footprint.
                if (File.Exists(originalPath)) File.Delete(originalPath);
            }

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

    /// <summary>
    /// Drops a drawing's cached pyramid. Called on soft delete so stale tiles
    /// stop being servable immediately (the /view cache-hit path never re-checks
    /// the store). Takes the generation gate so a purge never interleaves with a
    /// pyramid being built; otherwise best effort — meta.json goes first, so a
    /// partly-deleted folder is a cache miss and gets orphan-swept later.
    /// </summary>
    public async Task PurgeAsync(long id)
    {
        var gate = _locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            if (File.Exists(MetaPath(id))) File.Delete(MetaPath(id));
            if (Directory.Exists(Dir(id))) Directory.Delete(Dir(id), recursive: true);
        }
        catch (Exception e)
        {
            // A tile may be open in a viewer this very second (Windows lock).
            log.LogDebug(e, "Tile cache: could not fully purge drawing {Id} on delete", id);
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
                var name = Path.GetFileName(e.Dir);
                if (name == keepId.ToString()) continue;

                // Evict-while-regenerating race: without this, a drawing picked as the
                // LRU victim could be re-opened mid-delete and publish a pyramid with
                // tiles missing. Take the drawing's generation gate non-blockingly and
                // hold it for the whole delete — a concurrent view request then waits
                // on the gate, sees a cache miss and regenerates cleanly. If the gate
                // is already held (generation in progress), skip this round. GetOrAdd
                // (not TryGetValue) so both sides always contend on the same instance.
                SemaphoreSlim? gate = null;
                if (long.TryParse(name, out var dirId))
                {
                    gate = _locks.GetOrAdd(dirId, _ => new SemaphoreSlim(1, 1));
                    if (!gate.Wait(0)) continue;
                }
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
                        name, e.Size / 1048576.0, e.LastUse);
                }
                catch (Exception ex)
                {
                    // Files may be open (tiles being served right now) — skip, retry next round.
                    log.LogDebug(ex, "Tile cache: could not evict {Dir}", e.Dir);
                }
                finally
                {
                    gate?.Release();
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

    /// <summary>
    /// Fallback decode via Magick.NET for files the bundled libvips cannot read
    /// (its libtiff has no OJPEG codec, so old-style JPEG TIFFs fail). Writes a
    /// plain LZW TIFF that libvips handles. Unlike vips this decodes the whole
    /// image into memory — acceptable for the rare legacy file, and only on the
    /// first view (the resulting pyramid is cached like any other).
    /// </summary>
    private static void Transcode(string srcPath, string dstPath)
    {
        // First frame only — same page the vips path would show for a multi-page TIFF.
        using var img = new MagickImage(srcPath);
        img.Settings.Compression = CompressionMethod.LZW;
        img.Write(dstPath, MagickFormat.Tif);
    }

    /// <summary>vips error messages are multi-line walls; keep logs to the gist.</summary>
    private static string FirstLine(string s)
    {
        var i = s.IndexOf('\n');
        return (i < 0 ? s : s[..i]).Trim();
    }
}
