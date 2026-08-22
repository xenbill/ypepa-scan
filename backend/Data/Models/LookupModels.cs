namespace Mis.YpepaScan.Web.Data;

// Models of the lookup tables (C16PE_EIDOS_SXED, C16PE_KATHGORIA_ERG,
// C16PE_YPOKATHGORIA_ERG, C16PE_XOROS_APOTH_SXED) and the read-only Μονάδες
// (COMMON.G11HAF_STRUCTURE).

public record Lookup(long Id, string Name, long? ParentId = null);

public record LookupData(
    IReadOnlyList<Lookup> EidosSxed,
    IReadOnlyList<Lookup> KathgoriaErg,
    IReadOnlyList<Lookup> YpokatErg,
    IReadOnlyList<Lookup> XorosApoth,
    /// <summary>Units (COMMON.G11HAF_STRUCTURE) referenced by at least one live drawing — search filter only.</summary>
    IReadOnlyList<Lookup> MonadaInUse,
    /// <summary>
    /// Units offered when creating/editing a drawing: top-level Μονάδες only
    /// (HSTR_ID = MONADA, not the 999990 placeholder, Greek locations) — same
    /// rule as the legacy app. The full structure is never sent to the client: rows
    /// carry their unit name already joined, and the search filter uses MonadaInUse.
    /// </summary>
    IReadOnlyList<Lookup> MonadaEdit);

public sealed class LookupInUseException : Exception
{
    public LookupInUseException() : base("Η τιμή χρησιμοποιείται από υπάρχοντα σχέδια και δεν μπορεί να διαγραφεί.") { }
}
