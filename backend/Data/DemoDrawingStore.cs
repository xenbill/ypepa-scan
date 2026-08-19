using Sxedia.Web.Imaging;
using System.Text.Json;

namespace Sxedia.Web.Data;

/// <summary>
/// File-based store used for local development/demos, no Oracle needed.
/// Layout: {dir}/demo.json (metadata) + {dir}/files/{id}.tif
/// On first run it generates sample 10000x15000 drawings so the viewer
/// can be exercised at realistic sizes.
/// </summary>
public sealed class DemoDrawingStore : IDrawingStore
{
    private readonly string _dir;
    private readonly object _lock = new();
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    private sealed class DemoDb
    {
        public List<Lookup> EidosSxed { get; set; } = [];
        public List<Lookup> KathgoriaErg { get; set; } = [];
        public List<Lookup> YpokatErg { get; set; } = [];
        public List<Lookup> XorosApoth { get; set; } = [];
        public List<Lookup> Monada { get; set; } = [];
        public List<DemoRow> Drawings { get; set; } = [];
    }

    public sealed class DemoRow
    {
        public long SxedioId { get; set; }
        public string? KodikosErg { get; set; }
        public string? ArithmosSxed { get; set; }
        public string? TitlosErg { get; set; }
        public string? TitlosSxed { get; set; }
        public string? PerigrafhSxed { get; set; }
        public string? PerigrafhErg { get; set; }
        public DateTime? Hmer { get; set; }
        public long? EidosId { get; set; }
        public long? KathgId { get; set; }
        public long? YpokatId { get; set; }
        public long? XorosId { get; set; }
        public long? HstrId { get; set; }
        public int? MazikiKataxwrisi { get; set; }
        public bool Deleted { get; set; }
        public DateTime? DateIns { get; set; }
        public string? UserIns { get; set; }
    }

    public DemoDrawingStore(IConfiguration cfg, IWebHostEnvironment env)
    {
        _dir = string.IsNullOrWhiteSpace(cfg["Demo:Dir"])
            ? Path.Combine(env.ContentRootPath, "demo-data")
            : cfg["Demo:Dir"]!;
        Directory.CreateDirectory(Path.Combine(_dir, "files"));
        if (!File.Exists(DbPath))
            DemoSeeder.Seed(_dir);
    }

    private string DbPath => Path.Combine(_dir, "demo.json");
    private string FilePath(long id) => Path.Combine(_dir, "files", $"{id}.tif");

    private DemoDb Load()
    {
        lock (_lock)
            return JsonSerializer.Deserialize<DemoDb>(File.ReadAllText(DbPath))!;
    }

    private void Save(DemoDb db)
    {
        lock (_lock)
            File.WriteAllText(DbPath, JsonSerializer.Serialize(db, Json));
    }

    public Task<LookupData> GetLookupsAsync(CancellationToken ct = default)
    {
        var db = Load();
        var used = db.Drawings.Where(d => !d.Deleted && d.HstrId is not null).Select(d => d.HstrId!.Value).ToHashSet();
        var monadaInUse = db.Monada.Where(m => used.Contains(m.Id)).ToList();
        return Task.FromResult(new LookupData(db.EidosSxed, db.KathgoriaErg, db.YpokatErg, db.XorosApoth, db.Monada, monadaInUse));
    }

    private DrawingRow ToRow(DemoDb db, DemoRow d)
    {
        string? Name(IEnumerable<Lookup> l, long? id) => l.FirstOrDefault(x => x.Id == id)?.Name;
        return new DrawingRow
        {
            SxedioId = d.SxedioId, KodikosErg = d.KodikosErg, ArithmosSxed = d.ArithmosSxed,
            TitlosErg = d.TitlosErg, TitlosSxed = d.TitlosSxed,
            PerigrafhSxed = d.PerigrafhSxed, PerigrafhErg = d.PerigrafhErg, Hmer = d.Hmer,
            EidosSxed = Name(db.EidosSxed, d.EidosId), KathgoriaErg = Name(db.KathgoriaErg, d.KathgId),
            YpokathgoriaErg = Name(db.YpokatErg, d.YpokatId), XorosApoth = Name(db.XorosApoth, d.XorosId),
            Monada = Name(db.Monada, d.HstrId),
            EidosSxedId = d.EidosId, KathgErgId = d.KathgId, YpokatErgId = d.YpokatId,
            XorosApothId = d.XorosId, HstrId = d.HstrId,
            MazikiKataxwrisi = d.MazikiKataxwrisi ?? 0,
            DateIns = d.DateIns, UserIns = d.UserIns,
        };
    }

    public Task<SearchResult> SearchAsync(SearchParams p, CancellationToken ct = default)
    {
        var db = Load();
        IEnumerable<DemoRow> q = db.Drawings.Where(d => !d.Deleted);
        if (!string.IsNullOrWhiteSpace(p.Q))
        {
            var s = p.Q.Trim().ToUpperInvariant();
            q = q.Where(d => new[] { d.KodikosErg, d.ArithmosSxed, d.TitlosErg, d.TitlosSxed, d.PerigrafhSxed, d.PerigrafhErg }
                .Any(v => v?.ToUpperInvariant().Contains(s) == true));
        }
        if (p.KathgId is not null) q = q.Where(d => d.KathgId == p.KathgId);
        if (p.YpokatId is not null) q = q.Where(d => d.YpokatId == p.YpokatId);
        if (p.EidosId is not null) q = q.Where(d => d.EidosId == p.EidosId);
        if (p.XorosId is not null) q = q.Where(d => d.XorosId == p.XorosId);
        if (p.HstrId is not null) q = q.Where(d => d.HstrId == p.HstrId);
        if (p.InsFrom is not null) q = q.Where(d => d.DateIns >= p.InsFrom.Value.Date);
        if (p.InsTo is not null) q = q.Where(d => d.DateIns < p.InsTo.Value.Date.AddDays(1));

        var rows = q.Select(d => ToRow(db, d));

        Func<DrawingRow, object?> key = p.SortBy?.ToLowerInvariant() switch
        {
            "kodikoserg" => r => r.KodikosErg,
            "arithmossxed" => r => r.ArithmosSxed,
            "kathgoriaerg" => r => r.KathgoriaErg,
            "ypokathgoriaerg" => r => r.YpokathgoriaErg,
            "monada" => r => r.Monada,
            "titloserg" => r => r.TitlosErg,
            "titlossxed" => r => r.TitlosSxed,
            "eidossxed" => r => r.EidosSxed,
            "xorosapoth" => r => r.XorosApoth,
            "perigrafhsxed" => r => r.PerigrafhSxed,
            "perigrafherg" => r => r.PerigrafhErg,
            "hmer" => r => r.Hmer,
            "dateins" => r => r.DateIns,
            _ => r => null,
        };
        var desc = string.Equals(p.SortDir, "desc", StringComparison.OrdinalIgnoreCase);
        var all = p.SortBy is null
            ? rows.OrderByDescending(r => r.SxedioId).ToList()
            : (desc ? rows.OrderByDescending(key) : rows.OrderBy(key))
                .ThenByDescending(r => r.SxedioId).ToList();

        var pageSize = Math.Clamp(p.PageSize, 1, 100);
        var page = Math.Max(p.Page, 1);
        var items = all.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Task.FromResult(new SearchResult(items, all.Count, page, pageSize));
    }

    public Task<DrawingRow?> GetAsync(long id, CancellationToken ct = default)
    {
        var db = Load();
        var d = db.Drawings.FirstOrDefault(x => x.SxedioId == id && !x.Deleted);
        if (d is null) return Task.FromResult<DrawingRow?>(null);
        long? size = File.Exists(FilePath(id)) ? new FileInfo(FilePath(id)).Length : null;
        string? type = size is null ? null : FileTypes.Sniff(FilePath(id));
        return Task.FromResult<DrawingRow?>(ToRow(db, d) with { SizeBytes = size, FileType = type });
    }

    public Task<(Stream Stream, long Length)?> OpenFileAsync(long id, CancellationToken ct = default)
    {
        if (Load().Drawings.Any(x => x.SxedioId == id && x.Deleted))
            return Task.FromResult<(Stream, long)?>(null);
        var path = FilePath(id);
        if (!File.Exists(path)) return Task.FromResult<(Stream, long)?>(null);
        var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20, useAsync: true);
        return Task.FromResult<(Stream, long)?>((fs, fs.Length));
    }

    public async Task<long> ImportAsync(ImportMeta meta, Stream file, long length, CancellationToken ct = default)
    {
        var db = Load();
        var id = (db.Drawings.Count == 0 ? 0 : db.Drawings.Max(d => d.SxedioId)) + 1;
        await using (var fs = new FileStream(FilePath(id), FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 20, useAsync: true))
            await file.CopyToAsync(fs, ct);
        db.Drawings.Add(new DemoRow
        {
            SxedioId = id,
            KodikosErg = meta.KodikosErg,
            ArithmosSxed = meta.ArithmosSxed,
            TitlosErg = meta.TitlosErg,
            TitlosSxed = meta.TitlosSxed,
            PerigrafhSxed = meta.PerigrafhSxed,
            PerigrafhErg = meta.PerigrafhErg,
            Hmer = meta.Hmer,
            EidosId = meta.EidosId,
            KathgId = meta.KathgId,
            YpokatId = meta.YpokatId,
            XorosId = meta.XorosId,
            HstrId = meta.HstrId,
            DateIns = DateTime.Now,
            UserIns = meta.UserIns, // logged-in user (JWT name), set by the import endpoint
        });
        Save(db);
        return id;
    }

    public Task<bool> UpdateAsync(long id, ImportMeta meta, CancellationToken ct = default)
    {
        var db = Load();
        var d = db.Drawings.FirstOrDefault(x => x.SxedioId == id);
        if (d is null) return Task.FromResult(false);
        d.KodikosErg = meta.KodikosErg;
        d.ArithmosSxed = meta.ArithmosSxed;
        d.TitlosErg = meta.TitlosErg;
        d.TitlosSxed = meta.TitlosSxed;
        d.PerigrafhSxed = meta.PerigrafhSxed;
        d.PerigrafhErg = meta.PerigrafhErg;
        d.Hmer = meta.Hmer;
        d.EidosId = meta.EidosId;
        d.KathgId = meta.KathgId;
        d.YpokatId = meta.YpokatId;
        d.XorosId = meta.XorosId;
        d.HstrId = meta.HstrId;
        Save(db);
        return Task.FromResult(true);
    }

    public Task<bool> SoftDeleteAsync(long id, CancellationToken ct = default)
    {
        var db = Load();
        var d = db.Drawings.FirstOrDefault(x => x.SxedioId == id && !x.Deleted);
        if (d is null) return Task.FromResult(false);
        d.Deleted = true;
        Save(db);
        return Task.FromResult(true);
    }

    public Task<ArchiveStats> GetStatsAsync(CancellationToken ct = default)
    {
        var db = Load();
        var live = db.Drawings.Where(d => !d.Deleted).ToList();
        string Name(List<Lookup> l, long? id) => l.FirstOrDefault(x => x.Id == id)?.Name ?? "—";
        var perKathg = live.GroupBy(d => Name(db.KathgoriaErg, d.KathgId))
            .Select(g => new StatItem(g.Key, g.Count())).OrderByDescending(s => s.Count).ToList();
        var perEidos = live.GroupBy(d => Name(db.EidosSxed, d.EidosId))
            .Select(g => new StatItem(g.Key, g.Count())).OrderByDescending(s => s.Count).ToList();
        var perMonada = live.GroupBy(d => Name(db.Monada, d.HstrId))
            .Select(g => new StatItem(g.Key, g.Count())).OrderByDescending(s => s.Count).ToList();
        return Task.FromResult(new ArchiveStats(live.Count, perKathg, perEidos, perMonada));
    }

    // ---- lookup administration ------------------------------------------------
    private static List<Lookup> ListFor(DemoDb db, string type) => type switch
    {
        "eidos" => db.EidosSxed,
        "kathgoria" => db.KathgoriaErg,
        "ypokatigoria" => db.YpokatErg,
        "xoros" => db.XorosApoth,
        _ => throw new ArgumentException($"Unknown lookup type '{type}'."),
    };

    private static bool InUse(DemoDb db, string type, long id) => type switch
    {
        "eidos" => db.Drawings.Any(d => d.EidosId == id),
        "kathgoria" => db.Drawings.Any(d => d.KathgId == id) || db.YpokatErg.Any(y => y.ParentId == id),
        "ypokatigoria" => db.Drawings.Any(d => d.YpokatId == id),
        "xoros" => db.Drawings.Any(d => d.XorosId == id),
        _ => false,
    };

    public Task<long> AddLookupAsync(string type, string name, long? parentId, CancellationToken ct = default)
    {
        var db = Load();
        var list = ListFor(db, type);
        var id = (list.Count == 0 ? 0 : list.Max(l => l.Id)) + 1;
        list.Add(new Lookup(id, name, type == "ypokatigoria" ? parentId : null));
        Save(db);
        return Task.FromResult(id);
    }

    public Task<bool> UpdateLookupAsync(string type, long id, string name, long? parentId, CancellationToken ct = default)
    {
        var db = Load();
        var list = ListFor(db, type);
        var i = list.FindIndex(l => l.Id == id);
        if (i < 0) return Task.FromResult(false);
        list[i] = new Lookup(id, name, type == "ypokatigoria" ? parentId : null);
        Save(db);
        return Task.FromResult(true);
    }

    public Task<bool> DeleteLookupAsync(string type, long id, CancellationToken ct = default)
    {
        var db = Load();
        if (InUse(db, type, id)) throw new LookupInUseException();
        var removed = ListFor(db, type).RemoveAll(l => l.Id == id) > 0;
        if (removed) Save(db);
        return Task.FromResult(removed);
    }
}
