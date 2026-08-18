using System.Data;
using Dapper;
using Oracle.ManagedDataAccess.Client;
using Oracle.ManagedDataAccess.Types;

namespace Sxedia.Web.Data;

/// <summary>
/// Reads/writes the legacy C16PE_* tables. The schema is used exactly as the old
/// VB application left it, so old and new data stay in one place.
/// </summary>
public sealed class OracleDrawingStore : IDrawingStore
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

    public async Task<LookupData> GetLookupsAsync(CancellationToken ct = default)
    {
        await using var con = Open();
        var eidos = (await con.QueryAsync<(long, string)>(
            $"select EIDOS_SXED_ID, PERIGRAFH from {_owner}.C16PE_EIDOS_SXED order by PERIGRAFH"))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        var kathg = (await con.QueryAsync<(long, string)>(
            $"select KATHG_ERG_ID, PERIGRAFH from {_owner}.C16PE_KATHGORIA_ERG order by PERIGRAFH"))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        var ypokat = (await con.QueryAsync<(long, string, long?)>(
            $"select YPOKAT_ERG_ID, PERIGRAFH, KATHG_ERG_ID from {_owner}.C16PE_YPOKATHGORIA_ERG order by PERIGRAFH"))
            .Select(t => new Lookup(t.Item1, t.Item2, t.Item3)).ToList();
        var xoros = (await con.QueryAsync<(long, string)>(
            $"select XOROS_APOTH_ID, PERIGRAFH from {_owner}.C16PE_XOROS_APOTH_SXED order by PERIGRAFH"))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        // Μονάδα: HAF unit structure shared with the Filippos apps.
        var monada = (await con.QueryAsync<(long, string)>(
            $"select HSTR_ID, TITLE from {_commonOwner}.G11HAF_STRUCTURE order by TITLE"))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        // Search filter shows only units that actually have (non-deleted) drawings.
        var monadaInUse = (await con.QueryAsync<(long, string)>(
            $@"select h.HSTR_ID, h.TITLE from {_commonOwner}.G11HAF_STRUCTURE h
               where exists (select 1 from {_owner}.C16PE_SXEDIO s
                             where s.HSTR_ID = h.HSTR_ID and nvl(s.DELETED, 0) = 0)
               order by h.TITLE"))
            .Select(t => new Lookup(t.Item1, t.Item2)).ToList();
        return new LookupData(eidos, kathg, ypokat, xoros, monada, monadaInUse);
    }

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

    public async Task<SearchResult> SearchAsync(SearchParams p, CancellationToken ct = default)
    {
        // Soft-deleted drawings are invisible everywhere (nvl: rows older than the flag column count as live).
        var where = new List<string> { "nvl(s.DELETED, 0) = 0" };
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
        var wh = "where " + string.Join(" and ", where);

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
        var total = await con.ExecuteScalarAsync<int>($"select count(*) {BaseSelect} {wh}", args);
        var items = (await con.QueryAsync<DrawingRow>(
            $@"select {Cols} {BaseSelect} {wh}
               order by {orderBy}
               offset :off rows fetch next :n rows only", args)).ToList();
        return new SearchResult(items, total, page, pageSize);
    }

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

    public async Task<DrawingRow?> GetAsync(long id, CancellationToken ct = default)
    {
        await using var con = Open();
        return await con.QueryFirstOrDefaultAsync<DrawingRow>(
            $@"select {Cols},
                      (select dbms_lob.getlength(b.SXEDIO) from {_owner}.C16PE_SXEDIO_BLOB b
                        where b.SXEDIO_ID = s.SXEDIO_ID and rownum = 1) as SizeBytes
               {BaseSelect} where s.SXEDIO_ID = :id and nvl(s.DELETED, 0) = 0", new { id });
    }

    public async Task<(Stream Stream, long Length)?> OpenFileAsync(long id, CancellationToken ct = default)
    {
        // The connection/reader stay open for the lifetime of the returned stream;
        // WrappingStream disposes them when the caller finishes copying.
        var con = Open();
        try
        {
            await con.OpenAsync(ct);
            await using var cmd = con.CreateCommand();
            cmd.CommandText = $@"select b.SXEDIO from {_owner}.C16PE_SXEDIO_BLOB b
                                   join {_owner}.C16PE_SXEDIO s on s.SXEDIO_ID = b.SXEDIO_ID
                                  where b.SXEDIO_ID = :id and nvl(s.DELETED, 0) = 0";
            cmd.Parameters.Add(new OracleParameter("id", id));
            var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct);
            if (!await reader.ReadAsync(ct) || await ((OracleDataReader)reader).IsDBNullAsync(0, ct))
            {
                await reader.DisposeAsync();
                await con.DisposeAsync();
                return null;
            }
            OracleBlob blob = ((OracleDataReader)reader).GetOracleBlob(0);
            return (new WrappingStream(blob, reader, con), blob.Length);
        }
        catch
        {
            await con.DisposeAsync();
            throw;
        }
    }

    public async Task<long> ImportAsync(ImportMeta meta, Stream file, long length, CancellationToken ct = default)
    {
        await using var con = Open();
        await con.OpenAsync(ct);
        await using var tx = await con.BeginTransactionAsync(ct);

        var id = await con.ExecuteScalarAsync<long>(
            $"select nvl(max(SXEDIO_ID), 0) + 1 from {_owner}.C16PE_SXEDIO", transaction: tx);

        await con.ExecuteAsync(
            $@"insert into {_owner}.C16PE_SXEDIO
               (SXEDIO_ID, KODIKOS_ERG, ARITHMOS_SXED, EIDOS_SXED_ID, TITLOS_ERG, TITLOS_SXED,
                PERIGRAFH_SXED, PERIGRAFH_ERG, YPOKAT_ERG_ID, HMER, XOROS_APOTH_ID, KATHG_ERG_ID,
                HSTR_ID, DATE_INS, USER_INS, MAZIKI_KATAXWRISI)
               values
               (:id, :kodikos, :arithmos, :eidos, :titlosErg, :titlosSxed,
                :perSxed, :perErg, :ypokat, :hmer, :xoros, :kathg,
                :hstr, sysdate, :userIns, 0)",
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
            }, tx);

        // Stream the upload into the BLOB without holding it all in memory.
        await using (var cmd = con.CreateCommand())
        {
            cmd.Transaction = (Oracle.ManagedDataAccess.Client.OracleTransaction)tx;
            cmd.CommandText = $@"insert into {_owner}.C16PE_SXEDIO_BLOB (SXEDIO_ID, SXEDIO)
                                 values (:id, empty_blob())
                                 returning SXEDIO into :blob";
            cmd.Parameters.Add(new OracleParameter("id", id));
            var blobParam = new OracleParameter("blob", OracleDbType.Blob) { Direction = ParameterDirection.Output };
            cmd.Parameters.Add(blobParam);
            await cmd.ExecuteNonQueryAsync(ct);

            using var blob = (OracleBlob)blobParam.Value!;
            await file.CopyToAsync(blob, 1024 * 1024, ct);
        }

        await tx.CommitAsync(ct);
        return id;
    }

    public async Task<bool> UpdateAsync(long id, ImportMeta meta, CancellationToken ct = default)
    {
        await using var con = Open();
        var rows = await con.ExecuteAsync(
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
            });
        return rows > 0;
    }

    public async Task<bool> SoftDeleteAsync(long id, CancellationToken ct = default)
    {
        // Only the header row is flagged; the blob row is left untouched so the
        // scan itself is never marked and can be restored by clearing one flag.
        await using var con = Open();
        var rows = await con.ExecuteAsync(
            $"update {_owner}.C16PE_SXEDIO set DELETED = 1 where SXEDIO_ID = :id and nvl(DELETED, 0) = 0", new { id });
        return rows > 0;
    }

    public async Task<ArchiveStats> GetStatsAsync(CancellationToken ct = default)
    {
        await using var con = Open();
        var total = await con.ExecuteScalarAsync<int>(
            $"select count(*) from {_owner}.C16PE_SXEDIO s where nvl(s.DELETED, 0) = 0");
        var perKathg = (await con.QueryAsync<(string?, int)>(
            $@"select k.PERIGRAFH, count(*) from {_owner}.C16PE_SXEDIO s
               left join {_owner}.C16PE_KATHGORIA_ERG k on k.KATHG_ERG_ID = s.KATHG_ERG_ID
               where nvl(s.DELETED, 0) = 0
               group by k.PERIGRAFH order by count(*) desc"))
            .Select(t => new StatItem(t.Item1 ?? "— χωρίς κατηγορία —", t.Item2)).ToList();
        var perEidos = (await con.QueryAsync<(string?, int)>(
            $@"select e.PERIGRAFH, count(*) from {_owner}.C16PE_SXEDIO s
               left join {_owner}.C16PE_EIDOS_SXED e on e.EIDOS_SXED_ID = s.EIDOS_SXED_ID
               where nvl(s.DELETED, 0) = 0
               group by e.PERIGRAFH order by count(*) desc"))
            .Select(t => new StatItem(t.Item1 ?? "— χωρίς είδος —", t.Item2)).ToList();
        var perMonada = (await con.QueryAsync<(string?, int)>(
            $@"select h.TITLE, count(*) from {_owner}.C16PE_SXEDIO s
               left join {_commonOwner}.G11HAF_STRUCTURE h on h.HSTR_ID = s.HSTR_ID
               where nvl(s.DELETED, 0) = 0
               group by h.TITLE order by count(*) desc"))
            .Select(t => new StatItem(t.Item1 ?? "— χωρίς μονάδα —", t.Item2)).ToList();
        return new ArchiveStats(total, perKathg, perEidos, perMonada);
    }

    // ---- lookup administration ------------------------------------------------
    private (string Table, string IdCol) LookupTable(string type) => type switch
    {
        "eidos" => ($"{_owner}.C16PE_EIDOS_SXED", "EIDOS_SXED_ID"),
        "kathgoria" => ($"{_owner}.C16PE_KATHGORIA_ERG", "KATHG_ERG_ID"),
        "ypokatigoria" => ($"{_owner}.C16PE_YPOKATHGORIA_ERG", "YPOKAT_ERG_ID"),
        "xoros" => ($"{_owner}.C16PE_XOROS_APOTH_SXED", "XOROS_APOTH_ID"),
        _ => throw new ArgumentException($"Unknown lookup type '{type}'."),
    };

    public async Task<long> AddLookupAsync(string type, string name, long? parentId, CancellationToken ct = default)
    {
        var (table, idCol) = LookupTable(type);
        await using var con = Open();
        await con.OpenAsync(ct);
        await using var tx = await con.BeginTransactionAsync(ct);
        var id = await con.ExecuteScalarAsync<long>($"select nvl(max({idCol}), 0) + 1 from {table}", transaction: tx);
        if (type == "ypokatigoria")
            await con.ExecuteAsync(
                $"insert into {table} ({idCol}, PERIGRAFH, KATHG_ERG_ID) values (:id, :name, :parent)",
                new { id, name, parent = parentId }, tx);
        else
            await con.ExecuteAsync(
                $"insert into {table} ({idCol}, PERIGRAFH) values (:id, :name)",
                new { id, name }, tx);
        await tx.CommitAsync(ct);
        return id;
    }

    public async Task<bool> UpdateLookupAsync(string type, long id, string name, long? parentId, CancellationToken ct = default)
    {
        var (table, idCol) = LookupTable(type);
        await using var con = Open();
        var sql = type == "ypokatigoria"
            ? $"update {table} set PERIGRAFH = :name, KATHG_ERG_ID = :parent where {idCol} = :id"
            : $"update {table} set PERIGRAFH = :name where {idCol} = :id";
        return await con.ExecuteAsync(sql, new { id, name, parent = parentId }) > 0;
    }

    public async Task<bool> DeleteLookupAsync(string type, long id, CancellationToken ct = default)
    {
        var (table, idCol) = LookupTable(type);
        await using var con = Open();
        try
        {
            return await con.ExecuteAsync($"delete from {table} where {idCol} = :id", new { id }) > 0;
        }
        catch (OracleException ex) when (ex.Number == 2292) // ORA-02292: child record found
        {
            throw new LookupInUseException();
        }
    }

    /// <summary>Stream over an OracleBlob that disposes reader + connection on close.</summary>
    private sealed class WrappingStream(Stream inner, IAsyncDisposable reader, IAsyncDisposable connection) : Stream
    {
        public override bool CanRead => inner.CanRead;
        public override bool CanSeek => inner.CanSeek;
        public override bool CanWrite => false;
        public override long Length => inner.Length;
        public override long Position { get => inner.Position; set => inner.Position = value; }
        public override void Flush() => inner.Flush();
        public override int Read(byte[] buffer, int offset, int count) => inner.Read(buffer, offset, count);
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct)
            => inner.ReadAsync(buffer, offset, count, ct);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
            => inner.ReadAsync(buffer, ct);
        public override long Seek(long offset, SeekOrigin origin) => inner.Seek(offset, origin);
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                inner.Dispose();
                reader.DisposeAsync().AsTask().GetAwaiter().GetResult();
                connection.DisposeAsync().AsTask().GetAwaiter().GetResult();
            }
            base.Dispose(disposing);
        }
    }
}
