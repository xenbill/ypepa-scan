using Dapper;
using Mis.YpepaScan.Web.Imaging;
using Oracle.ManagedDataAccess.Client;
using Oracle.ManagedDataAccess.Types;
using System.Data;

namespace Mis.YpepaScan.Web.Data;

/// <summary>C16PE_SXEDIO_BLOB — the stored file of each drawing.</summary>
public sealed partial class OracleDrawingStore
{
    /// <summary>First bytes of the blob for the magic-number sniff — no full read.</summary>
    private async Task<byte[]?> ReadBlobHeadAsync(OracleConnection con, long id, CancellationToken ct)
        => await con.ExecuteScalarAsync<byte[]>(Cmd(
            $@"select dbms_lob.substr(b.SXEDIO, {FileTypes.HeadLength}, 1) from {_owner}.C16PE_SXEDIO_BLOB b
                where b.SXEDIO_ID = :id and rownum = 1", new { id }, ct));

    public async Task<(Stream Stream, long Length)?> OpenFileAsync(long id, CancellationToken ct = default)
    {
        // The connection/reader stay open for the lifetime of the returned stream;
        // WrappingStream disposes them when the caller finishes copying.
        var con = Open();
        try
        {
            await con.OpenAsync(ct);
            await using var cmd = con.CreateCommand();
            // The join keeps a deleted drawing's orphan blob row (see DeleteAsync) unreadable.
            cmd.CommandText = $@"select b.SXEDIO from {_owner}.C16PE_SXEDIO_BLOB b
                                   join {_owner}.C16PE_SXEDIO s on s.SXEDIO_ID = b.SXEDIO_ID
                                  where b.SXEDIO_ID = :id";
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

    /// <summary>Streams the upload into a new blob row inside the caller's transaction,
    /// without holding the file in memory.</summary>
    private async Task InsertBlobAsync(OracleConnection con, OracleTransaction tx, long id, Stream file, CancellationToken ct)
    {
        await using var cmd = con.CreateCommand();
        cmd.Transaction = tx;
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

        // ASP.NET disposes response streams asynchronously; this path avoids sync-over-async.
        public override async ValueTask DisposeAsync()
        {
            await inner.DisposeAsync();
            await reader.DisposeAsync();
            await connection.DisposeAsync();
            GC.SuppressFinalize(this);
        }

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
