using Dapper;
using Oracle.ManagedDataAccess.Client;

namespace Mis.YpepaScan.Web.Data;

/// <summary>
/// Reads/writes the legacy C16PE_* tables. The schema is used exactly as the old
/// VB application left it, so old and new data stay in one place.
/// Split by table into partial files: Drawings (C16PE_SXEDIO), Blob (C16PE_SXEDIO_BLOB),
/// Archive (C16PE_SXEDIO_DELETED), Lookups (C16PE_EIDOS_SXED & co, G11HAF_*).
/// </summary>
public sealed partial class OracleDrawingStore : IDrawingStore
{
    private readonly string _connString;
    private readonly string _owner;
    private readonly string _commonOwner;

    public OracleDrawingStore(IConfiguration cfg)
    {
        _connString = cfg["Oracle:ConnectionString"]
            ?? throw new InvalidOperationException("Oracle:ConnectionString is not configured.");
        _owner = cfg["Oracle:Owner"] ?? "CCC";
        _commonOwner = cfg["Oracle:CommonOwner"] ?? "COMMON";
    }

    private OracleConnection Open() => new(_connString);

    /// <summary>Dapper command that carries the request's CancellationToken, so Oracle stops
    /// the statement when the browser aborts (filters changed again, page left).</summary>
    private static CommandDefinition Cmd(string sql, object? args = null, CancellationToken ct = default,
                                         System.Data.IDbTransaction? tx = null)
        => new(sql, args, tx, cancellationToken: ct);
}
