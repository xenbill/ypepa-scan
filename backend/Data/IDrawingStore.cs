namespace Mis.YpepaScan.Web.Data;

/// <summary>The drawing archive. Implemented by OracleDrawingStore (production, legacy C16PE_*
/// tables) and DemoDrawingStore (local files, Storage:Mode=Demo).</summary>
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

    /// <summary>Delete: moves the header row into the C16PE_SXEDIO_DELETED archive and removes it
    /// from C16PE_SXEDIO — the legacy application knows nothing about a deleted flag, so the row has
    /// to leave the table it reads. The blob row is never touched, so moving the header row back
    /// restores the drawing with its scan.</summary>
    Task<bool> DeleteAsync(long id, string? deletedBy, CancellationToken ct = default);

    Task<ArchiveStats> GetStatsAsync(CancellationToken ct = default);

    // Lookup administration. type: "eidos" | "kathgoria" | "ypokatigoria" | "xoros".
    // (Μονάδες are read-only — they belong to COMMON.G11HAF_STRUCTURE.)
    Task<long> AddLookupAsync(string type, string name, long? parentId, CancellationToken ct = default);
    Task<bool> UpdateLookupAsync(string type, long id, string name, long? parentId, CancellationToken ct = default);
    /// <summary>Throws LookupInUseException when drawings still reference the value.</summary>
    Task<bool> DeleteLookupAsync(string type, long id, CancellationToken ct = default);
}
