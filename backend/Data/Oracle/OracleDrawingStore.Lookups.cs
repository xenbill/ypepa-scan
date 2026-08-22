using Dapper;
using Oracle.ManagedDataAccess.Client;

namespace Mis.YpepaScan.Web.Data;

/// <summary>The lookup tables: C16PE_EIDOS_SXED, C16PE_KATHGORIA_ERG, C16PE_YPOKATHGORIA_ERG,
/// C16PE_XOROS_APOTH_SXED (editable) and COMMON.G11HAF_STRUCTURE / G11HAF_LOCATIONS (read-only Μονάδες).</summary>
public sealed partial class OracleDrawingStore
{
    public async Task<LookupData> GetLookupsAsync(CancellationToken ct = default)
    {
        await using var con = Open();
        var eidos = (await con.QueryAsync<(long, string)>(Cmd(
            $"select EIDOS_SXED_ID, PERIGRAFH from {_owner}.C16PE_EIDOS_SXED order by PERIGRAFH", ct: ct)))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        var kathg = (await con.QueryAsync<(long, string)>(Cmd(
            $"select KATHG_ERG_ID, PERIGRAFH from {_owner}.C16PE_KATHGORIA_ERG order by PERIGRAFH", ct: ct)))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        var ypokat = (await con.QueryAsync<(long, string, long?)>(Cmd(
            $"select YPOKAT_ERG_ID, PERIGRAFH, KATHG_ERG_ID from {_owner}.C16PE_YPOKATHGORIA_ERG order by PERIGRAFH", ct: ct)))
            .Select(t => new Lookup(t.Item1, t.Item2, t.Item3)).ToList();
        var xoros = (await con.QueryAsync<(long, string)>(Cmd(
            $"select XOROS_APOTH_ID, PERIGRAFH from {_owner}.C16PE_XOROS_APOTH_SXED order by PERIGRAFH", ct: ct)))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        // Μονάδα: HAF unit structure shared with the Filippos apps. Search filter
        // shows only units that actually have drawings.
        var monadaInUse = (await con.QueryAsync<(long, string)>(Cmd(
            $@"select h.HSTR_ID, h.TITLE from {_commonOwner}.G11HAF_STRUCTURE h
               where exists (select 1 from {_owner}.C16PE_SXEDIO s
                             where s.HSTR_ID = h.HSTR_ID)
               order by h.TITLE", ct: ct)))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        // Create/edit: only Μονάδες (same query as the legacy WinForms app).
        var monadaEdit = (await con.QueryAsync<(long, string)>(Cmd(
            $@"select h.HSTR_ID, h.TITLE
               from {_commonOwner}.G11HAF_STRUCTURE h
               join {_commonOwner}.G11HAF_LOCATIONS l on l.HAFLOC_ID = h.HAFLOC_ID
               where h.HSTR_ID = h.MONADA
                 and h.HSTR_ID <> 999990
                 and l.COUNTRY_ID = 24067
               order by h.TITLE", ct: ct)))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        return new LookupData(eidos, kathg, ypokat, xoros, monadaInUse, monadaEdit);
    }

    // ---- lookup administration ------------------------------------------------
    private (string Table, string IdCol, string Seq) LookupTable(string type) => type switch
    {
        "eidos" => ($"{_owner}.C16PE_EIDOS_SXED", "EIDOS_SXED_ID", $"{_owner}.C16PE_EIDOS_SXED_SEQ"),
        "kathgoria" => ($"{_owner}.C16PE_KATHGORIA_ERG", "KATHG_ERG_ID", $"{_owner}.C16PE_KATHGORIA_ERG_SEQ"),
        "ypokatigoria" => ($"{_owner}.C16PE_YPOKATHGORIA_ERG", "YPOKAT_ERG_ID", $"{_owner}.C16PE_YPOKATHGORIA_ERG_SEQ"),
        "xoros" => ($"{_owner}.C16PE_XOROS_APOTH_SXED", "XOROS_APOTH_ID", $"{_owner}.C16PE_XOROS_APOTH_SXED_SEQ"),
        _ => throw new ArgumentException($"Unknown lookup type '{type}'."),
    };

    public async Task<long> AddLookupAsync(string type, string name, long? parentId, CancellationToken ct = default)
    {
        var (table, idCol, seq) = LookupTable(type);
        await using var con = Open();
        var id = await con.ExecuteScalarAsync<long>(Cmd($"select {seq}.nextval from dual", ct: ct));
        if (type == "ypokatigoria")
            await con.ExecuteAsync(Cmd(
                $"insert into {table} ({idCol}, PERIGRAFH, KATHG_ERG_ID) values (:id, :name, :parent)",
                new { id, name, parent = parentId }, ct));
        else
            await con.ExecuteAsync(Cmd(
                $"insert into {table} ({idCol}, PERIGRAFH) values (:id, :name)",
                new { id, name }, ct));
        return id;
    }

    public async Task<bool> UpdateLookupAsync(string type, long id, string name, long? parentId, CancellationToken ct = default)
    {
        var (table, idCol, _) = LookupTable(type);
        await using var con = Open();
        var sql = type == "ypokatigoria"
            ? $"update {table} set PERIGRAFH = :name, KATHG_ERG_ID = :parent where {idCol} = :id"
            : $"update {table} set PERIGRAFH = :name where {idCol} = :id";
        return await con.ExecuteAsync(Cmd(sql, new { id, name, parent = parentId }, ct)) > 0;
    }

    public async Task<bool> DeleteLookupAsync(string type, long id, CancellationToken ct = default)
    {
        var (table, idCol, _) = LookupTable(type);
        await using var con = Open();
        try
        {
            return await con.ExecuteAsync(Cmd($"delete from {table} where {idCol} = :id", new { id }, ct)) > 0;
        }
        catch (OracleException ex) when (ex.Number == 2292) // ORA-02292: child record found
        {
            throw new LookupInUseException();
        }
    }
}
