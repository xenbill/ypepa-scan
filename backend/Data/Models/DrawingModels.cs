namespace Mis.YpepaScan.Web.Data;

// Models of the drawing header row (C16PE_SXEDIO): the row as read, the search
// request/response and the metadata accepted on import/update.

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
    /// <summary>File type from magic numbers ("pdf" | "tiff" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "dwg" | "zip" | "ole" | "unknown"). Only populated by GetAsync; null when no file.</summary>
    public string? FileType { get; init; }
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
    string? UserIns,
    /// <summary>True when the row comes from a mass import (MAZIKI_KATAXWRISI = 1). Ignored on update.</summary>
    bool Maziki = false);
