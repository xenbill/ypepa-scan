namespace Mis.YpepaScan.Web.Data;

// Home-page archive statistics (counts of C16PE_SXEDIO per lookup value).

/// <summary>Id is the lookup id to filter the list by; null for drawings without a value.</summary>
public record StatItem(string Name, int Count, long? Id = null);

public record ArchiveStats(
    int Total,
    IReadOnlyList<StatItem> PerKathgoria,
    IReadOnlyList<StatItem> PerEidos,
    IReadOnlyList<StatItem> PerMonada);
