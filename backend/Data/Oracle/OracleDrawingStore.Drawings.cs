using Dapper;
using Mis.YpepaScan.Web.Imaging;
using Oracle.ManagedDataAccess.Client;

namespace Mis.YpepaScan.Web.Data;

/// <summary>C16PE_SXEDIO — the drawing header rows: search, read, import, update, stats.</summary>
public sealed partial class OracleDrawingStore
{
    private string BaseSelect => $@"
        from {_owner}.C16PE_SXEDIO s
        left join {_owner}.C16PE_EIDOS_SXED e        on e.EIDOS_SXED_ID  = s.EIDOS_SXED_ID
        left join {_owner}.C16PE_KATHGORIA_ERG k     on k.KATHG_ERG_ID   = s.KATHG_ERG_ID
        left join {_owner}.C16PE_YPOKATHGORIA_ERG y  on y.YPOKAT_ERG_ID  = s.YPOKAT_ERG_ID
        left join {_owner}.C16PE_XOROS_APOTH_SXED x  on x.XOROS_APOTH_ID = s.XOROS_APOTH_ID
        left join {_commonOwner}.G11HAF_STRUCTURE h  on h.HSTR_ID        = s.HSTR_ID";

    private const string Cols = @"
        s.SXEDIO_ID       as SxedioId,
        s.KODIKOS_ERG     as KodikosErg,
        s.ARITHMOS_SXED   as ArithmosSxed,
        s.TITLOS_ERG      as TitlosErg,
        s.TITLOS_SXED     as TitlosSxed,
        s.PERIGRAFH_SXED  as PerigrafhSxed,
        s.PERIGRAFH_ERG   as PerigrafhErg,
        s.HMER            as Hmer,
        e.PERIGRAFH       as EidosSxed,
        k.PERIGRAFH       as KathgoriaErg,
        y.PERIGRAFH       as YpokathgoriaErg,
        x.PERIGRAFH       as XorosApoth,
        h.TITLE           as Monada,
        s.EIDOS_SXED_ID   as EidosSxedId,
        s.KATHG_ERG_ID    as KathgErgId,
        s.YPOKAT_ERG_ID   as YpokatErgId,
        s.XOROS_APOTH_ID  as XorosApothId,
        s.HSTR_ID         as HstrId,
        s.MAZIKI_KATAXWRISI as MazikiKataxwrisi,
        s.DATE_INS        as DateIns,
        s.USER_INS        as UserIns";

    private static readonly Dictionary<string, string> SortColumns = new(StringComparer.OrdinalIgnoreCase)
    {
        ["kodikosErg"] = "s.KODIKOS_ERG",
        ["arithmosSxed"] = "s.ARITHMOS_SXED",
        ["kathgoriaErg"] = "k.PERIGRAFH",
        ["ypokathgoriaErg"] = "y.PERIGRAFH",
        ["monada"] = "h.TITLE",
        ["titlosErg"] = "s.TITLOS_ERG",
        ["titlosSxed"] = "s.TITLOS_SXED",
        ["eidosSxed"] = "e.PERIGRAFH",
        ["xorosApoth"] = "x.PERIGRAFH",
        ["perigrafhSxed"] = "s.PERIGRAFH_SXED",
        ["perigrafhErg"] = "s.PERIGRAFH_ERG",
        ["hmer"] = "s.HMER",
        ["dateIns"] = "s.DATE_INS",
    };

    public async Task<SearchResult> SearchAsync(SearchParams p, CancellationToken ct = default)
    {
        // Deleted drawings are not in C16PE_SXEDIO at all (see DeleteAsync), so nothing to filter out.
        var where = new List<string>();
        var args = new DynamicParameters();
        if (!string.IsNullOrWhiteSpace(p.Q))
        {
            where.Add(@"(upper(s.KODIKOS_ERG)    like :q or
                         upper(s.ARITHMOS_SXED)  like :q or
                         upper(s.TITLOS_ERG)     like :q or
                         upper(s.TITLOS_SXED)    like :q or
                         upper(s.PERIGRAFH_SXED) like :q or
                         upper(s.PERIGRAFH_ERG)  like :q)");
            args.Add("q", "%" + p.Q.Trim().ToUpperInvariant() + "%");
        }
        if (p.KathgId is not null) { where.Add("s.KATHG_ERG_ID = :kathg");    args.Add("kathg", p.KathgId); }
        if (p.YpokatId is not null) { where.Add("s.YPOKAT_ERG_ID = :ypokat"); args.Add("ypokat", p.YpokatId); }
        if (p.EidosId is not null) { where.Add("s.EIDOS_SXED_ID = :eidos");   args.Add("eidos", p.EidosId); }
        if (p.XorosId is not null) { where.Add("s.XOROS_APOTH_ID = :xoros");  args.Add("xoros", p.XorosId); }
        if (p.HstrId is not null) { where.Add("s.HSTR_ID = :hstr");           args.Add("hstr", p.HstrId); }
        if (p.InsFrom is not null) { where.Add("s.DATE_INS >= :insFrom");     args.Add("insFrom", p.InsFrom.Value.Date); }
        if (p.InsTo is not null) { where.Add("s.DATE_INS < :insTo");          args.Add("insTo", p.InsTo.Value.Date.AddDays(1)); }
        var wh = where.Count == 0 ? "" : "where " + string.Join(" and ", where);

        var pageSize = Math.Clamp(p.PageSize, 1, 100);
        var page = Math.Max(p.Page, 1);
        args.Add("off", (page - 1) * pageSize);
        args.Add("n", pageSize);

        // Whitelisted sort columns (never interpolate user input into SQL directly).
        var orderBy = "s.SXEDIO_ID desc";
        if (p.SortBy is not null && SortColumns.TryGetValue(p.SortBy, out var col))
        {
            var dir = string.Equals(p.SortDir, "desc", StringComparison.OrdinalIgnoreCase) ? "desc" : "asc";
            orderBy = $"{col} {dir} nulls last, s.SXEDIO_ID desc";
        }

        await using var con = Open();
        var total = await con.ExecuteScalarAsync<int>(Cmd($"select count(*) {BaseSelect} {wh}", args, ct));
        var items = (await con.QueryAsync<DrawingRow>(Cmd(
            $@"select {Cols} {BaseSelect} {wh}
               order by {orderBy}
               offset :off rows fetch next :n rows only", args, ct))).ToList();
        return new SearchResult(items, total, page, pageSize);
    }

    public async Task<DrawingRow?> GetAsync(long id, CancellationToken ct = default)
    {
        await using var con = Open();
        var row = await con.QueryFirstOrDefaultAsync<DrawingRow>(Cmd(
            $@"select {Cols},
                      (select dbms_lob.getlength(b.SXEDIO) from {_owner}.C16PE_SXEDIO_BLOB b
                        where b.SXEDIO_ID = s.SXEDIO_ID and rownum = 1) as SizeBytes
               {BaseSelect} where s.SXEDIO_ID = :id", new { id }, ct));
        if (row is null || row.SizeBytes is null) return row;
        var head = await ReadBlobHeadAsync(con, id, ct);
        return row with { FileType = head is null ? "unknown" : FileTypes.Sniff(head) };
    }

    public async Task<long> ImportAsync(ImportMeta meta, Stream file, long length, CancellationToken ct = default)
    {
        // Header row + blob row in one transaction (see InsertBlobAsync for the blob half).
        await using var con = Open();
        await con.OpenAsync(ct);
        await using var tx = await con.BeginTransactionAsync(ct);

        // Same sequence the legacy VB application uses, so both apps can insert
        // concurrently without id collisions.
        var id = await con.ExecuteScalarAsync<long>(
            Cmd($"select {_owner}.C16PE_SXEDIO_SEQ.nextval from dual", ct: ct, tx: tx));

        await con.ExecuteAsync(Cmd(
            $@"insert into {_owner}.C16PE_SXEDIO
               (SXEDIO_ID, KODIKOS_ERG, ARITHMOS_SXED, EIDOS_SXED_ID, TITLOS_ERG, TITLOS_SXED,
                PERIGRAFH_SXED, PERIGRAFH_ERG, YPOKAT_ERG_ID, HMER, XOROS_APOTH_ID, KATHG_ERG_ID,
                HSTR_ID, DATE_INS, USER_INS, MAZIKI_KATAXWRISI)
               values
               (:id, :kodikos, :arithmos, :eidos, :titlosErg, :titlosSxed,
                :perSxed, :perErg, :ypokat, :hmer, :xoros, :kathg,
                :hstr, sysdate, :userIns, :maziki)",
            new
            {
                id,
                kodikos = meta.KodikosErg,
                arithmos = meta.ArithmosSxed,
                eidos = meta.EidosId,
                titlosErg = meta.TitlosErg,
                titlosSxed = meta.TitlosSxed,
                perSxed = meta.PerigrafhSxed,
                perErg = meta.PerigrafhErg,
                ypokat = meta.YpokatId,
                hmer = meta.Hmer,
                xoros = meta.XorosId,
                kathg = meta.KathgId,
                hstr = meta.HstrId,
                userIns = meta.UserIns, // logged-in user (JWT name), set by the import endpoint
                maziki = meta.Maziki ? 1 : 0,
            }, ct, tx));

        await InsertBlobAsync(con, (OracleTransaction)tx, id, file, ct);

        await tx.CommitAsync(ct);
        return id;
    }

    public async Task<bool> UpdateAsync(long id, ImportMeta meta, CancellationToken ct = default)
    {
        await using var con = Open();
        var rows = await con.ExecuteAsync(Cmd(
            $@"update {_owner}.C16PE_SXEDIO set
                 KODIKOS_ERG    = :kodikos,
                 ARITHMOS_SXED  = :arithmos,
                 EIDOS_SXED_ID  = :eidos,
                 TITLOS_ERG     = :titlosErg,
                 TITLOS_SXED    = :titlosSxed,
                 PERIGRAFH_SXED = :perSxed,
                 PERIGRAFH_ERG  = :perErg,
                 YPOKAT_ERG_ID  = :ypokat,
                 HMER           = :hmer,
                 XOROS_APOTH_ID = :xoros,
                 KATHG_ERG_ID   = :kathg,
                 HSTR_ID        = :hstr
               where SXEDIO_ID = :id",
            new
            {
                id,
                kodikos = meta.KodikosErg,
                arithmos = meta.ArithmosSxed,
                eidos = meta.EidosId,
                titlosErg = meta.TitlosErg,
                titlosSxed = meta.TitlosSxed,
                perSxed = meta.PerigrafhSxed,
                perErg = meta.PerigrafhErg,
                ypokat = meta.YpokatId,
                hmer = meta.Hmer,
                xoros = meta.XorosId,
                kathg = meta.KathgId,
                hstr = meta.HstrId,
            }, ct));
        return rows > 0;
    }

    public async Task<ArchiveStats> GetStatsAsync(CancellationToken ct = default)
    {
        await using var con = Open();
        var total = await con.ExecuteScalarAsync<int>(
            Cmd($"select count(*) from {_owner}.C16PE_SXEDIO s", ct: ct));
        var perKathg = (await con.QueryAsync<(string?, int, long?)>(Cmd(
            $@"select k.PERIGRAFH, count(*), s.KATHG_ERG_ID from {_owner}.C16PE_SXEDIO s
               left join {_owner}.C16PE_KATHGORIA_ERG k on k.KATHG_ERG_ID = s.KATHG_ERG_ID
               group by k.PERIGRAFH, s.KATHG_ERG_ID order by count(*) desc", ct: ct)))
            .Select(t => new StatItem(t.Item1 ?? "— χωρίς κατηγορία —", t.Item2, t.Item3)).ToList();
        var perEidos = (await con.QueryAsync<(string?, int, long?)>(Cmd(
            $@"select e.PERIGRAFH, count(*), s.EIDOS_SXED_ID from {_owner}.C16PE_SXEDIO s
               left join {_owner}.C16PE_EIDOS_SXED e on e.EIDOS_SXED_ID = s.EIDOS_SXED_ID
               group by e.PERIGRAFH, s.EIDOS_SXED_ID order by count(*) desc", ct: ct)))
            .Select(t => new StatItem(t.Item1 ?? "— χωρίς είδος —", t.Item2, t.Item3)).ToList();
        var perMonada = (await con.QueryAsync<(string?, int, long?)>(Cmd(
            $@"select h.TITLE, count(*), s.HSTR_ID from {_owner}.C16PE_SXEDIO s
               left join {_commonOwner}.G11HAF_STRUCTURE h on h.HSTR_ID = s.HSTR_ID
               group by h.TITLE, s.HSTR_ID order by count(*) desc", ct: ct)))
            .Select(t => new StatItem(t.Item1 ?? "— χωρίς μονάδα —", t.Item2, t.Item3)).ToList();
        return new ArchiveStats(total, perKathg, perEidos, perMonada);
    }
}
