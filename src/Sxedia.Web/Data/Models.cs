namespace Sxedia.Web.Data;

public record Lookup(long Id, string Name, long? ParentId = null);

public record LookupData(
    IReadOnlyList<Lookup> EidosSxed,
    IReadOnlyList<Lookup> KathgoriaErg,
    IReadOnlyList<Lookup> YpokatErg,
    IReadOnlyList<Lookup> XorosApoth,
    IReadOnlyList<Lookup> Monada);

public record DrawingRow(
    long SxedioId,
    string? KodikosErg,
    string? ArithmosSxed,
    string? TitlosErg,
    string? TitlosSxed,
    string? PerigrafhSxed,
    string? PerigrafhErg,
    DateTime? Hmer,
    string? EidosSxed,
    string? KathgoriaErg,
    string? YpokathgoriaErg,
    string? XorosApoth,
    string? Monada,
    long? EidosSxedId,
    long? KathgErgId,
    long? YpokatErgId,
    long? XorosApothId,
    long? HstrId,
    int? MazikiKataxwrisi,
    DateTime? DateIns,
    string? UserIns,
    long? SizeBytes);

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
