namespace Sxedia.Web.Data;

public record Lookup(long Id, string Name, long? ParentId = null);

public record LookupData(
    IReadOnlyList<Lookup> EidosSxed,
    IReadOnlyList<Lookup> KathgoriaErg,
    IReadOnlyList<Lookup> YpokatErg,
    IReadOnlyList<Lookup> XorosApoth,
    IReadOnlyList<Lookup> Monada,
    /// <summary>Subset of Monada referenced by at least one live drawing (search filter only).</summary>
    IReadOnlyList<Lookup> MonadaInUse);

/// <summary>
/// Init-property record (not positional): Dapper needs a parameterless constructor to
/// map Oracle NUMBER (decimal) columns onto long/int with conversion. A positional
/// record demands an exact-type constructor match and fails at runtime against Oracle.
/// </summary>
public record DrawingRow
{
    public long SxedioId { get; init; }
    public string? KodikosErg { get; init; }
    public string? ArithmosSxed { get; init; }
    public string? TitlosErg { get; init; }
    public string? TitlosSxed { get; init; }
    public string? PerigrafhSxed { get; init; }
    public string? PerigrafhErg { get; init; }
    public DateTime? Hmer { get; init; }
    public string? EidosSxed { get; init; }
    public string? KathgoriaErg { get; init; }
    public string? YpokathgoriaErg { get; init; }
    public string? XorosApoth { get; init; }
    public string? Monada { get; init; }
    public long? EidosSxedId { get; init; }
    public long? KathgErgId { get; init; }
    public long? YpokatErgId { get; init; }
    public long? XorosApothId { get; init; }
    public long? HstrId { get; init; }
    public int? MazikiKataxwrisi { get; init; }
    public DateTime? DateIns { get; init; }
    public string? UserIns { get; init; }
    /// <summary>Stored file length. Only populated by GetAsync (single row); null in search lists.</summary>
    public long? SizeBytes { get; init; }
}

public record SearchResult(IReadOnlyList<DrawingRow> Items, int Total, int Page, int PageSize);

public record SearchParams(
    string? Q,
    long? KathgId,
    long? YpokatId,
    long? EidosId,
    long? XorosId,
    long? HstrId,
    DateTime? InsFrom = null,
    DateTime? InsTo = null,
    string? SortBy = null,
    string? SortDir = null,
    int Page = 1,
    int PageSize = 20);

public record ImportMeta(
    string? KodikosErg,
    string? ArithmosSxed,
    string? TitlosErg,
    string? TitlosSxed,
    string? PerigrafhSxed,
    string? PerigrafhErg,
    DateTime? Hmer,
    long? EidosId,
    long? KathgId,
    long? YpokatId,
    long? XorosId,
    long? HstrId,
    string? UserIns);

public interface IDrawingStore
{
    Task<LookupData> GetLookupsAsync(CancellationToken ct = default);
    Task<SearchResult> SearchAsync(SearchParams p, CancellationToken ct = default);
    Task<DrawingRow?> GetAsync(long id, CancellationToken ct = default);
    /// <summary>Opens the stored file for reading. Returns null if the drawing has no file.</summary>
    Task<(Stream Stream, long Length)?> OpenFileAsync(long id, CancellationToken ct = default);
    Task<long> ImportAsync(ImportMeta meta, Stream file, long length, CancellationToken ct = default);
    /// <summary>Updates the metadata of an existing drawing (file untouched). False if id not found.</summary>
    Task<bool> UpdateAsync(long id, ImportMeta meta, CancellationToken ct = default);

    /// <summary>Soft delete: sets DELETED=1 on header + blob rows; nothing is physically removed.</summary>
    Task<bool> SoftDeleteAsync(long id, CancellationToken ct = default);

    Task<ArchiveStats> GetStatsAsync(CancellationToken ct = default);

    // Lookup administration. type: "eidos" | "kathgoria" | "ypokatigoria" | "xoros".
    // (Μονάδες are read-only — they belong to COMMON.G11HAF_STRUCTURE.)
    Task<long> AddLookupAsync(string type, string name, long? parentId, CancellationToken ct = default);
    Task<bool> UpdateLookupAsync(string type, long id, string name, long? parentId, CancellationToken ct = default);
    /// <summary>Throws LookupInUseException when drawings still reference the value.</summary>
    Task<bool> DeleteLookupAsync(string type, long id, CancellationToken ct = default);
}

public record StatItem(string Name, int Count);
public record ArchiveStats(
    int Total,
    IReadOnlyList<StatItem> PerKathgoria,
    IReadOnlyList<StatItem> PerEidos,
    IReadOnlyList<StatItem> PerMonada);

public sealed class LookupInUseException : Exception
{
    public LookupInUseException() : base("Η τιμή χρησιμοποιείται από υπάρχοντα σχέδια και δεν μπορεί να διαγραφεί.") { }
}
