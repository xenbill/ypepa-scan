using Dapper;

namespace Mis.YpepaScan.Web.Data;

/// <summary>C16PE_SXEDIO_DELETED — where deleted header rows are moved.</summary>
public sealed partial class OracleDrawingStore
{
    public async Task<bool> DeleteAsync(long id, string? deletedBy, CancellationToken ct = default)
    {
        // The legacy application has no notion of a deleted flag, so a flagged row would keep
        // showing up there: the header row is moved out of C16PE_SXEDIO into the archive table
        // instead (both statements in one transaction). The blob row is left untouched — putting
        // the header row back is all it takes to restore the drawing with its scan.
        // Archive key: a v7 GUID (time-ordered, so the archive reads in deletion order).
        await using var con = Open();
        await con.OpenAsync(ct);
        await using var tx = await con.BeginTransactionAsync(ct);
        var args = new { did = Guid.CreateVersion7().ToString(), deletedBy, id };
        var archived = await con.ExecuteAsync(Cmd(
            $@"insert into {_owner}.C16PE_SXEDIO_DELETED
               (ID, DELETED_AT, DELETED_BY,
                SXEDIO_ID, KODIKOS_ERG, ARITHMOS_SXED, EIDOS_SXED_ID, TITLOS_ERG, TITLOS_SXED,
                PERIGRAFH_SXED, PERIGRAFH_ERG, YPOKAT_ERG_ID, HMER, XOROS_APOTH_ID, KATHG_ERG_ID,
                HSTR_ID, DATE_INS, USER_INS, MAZIKI_KATAXWRISI)
               select :did, sysdate, :deletedBy,
                      s.SXEDIO_ID, s.KODIKOS_ERG, s.ARITHMOS_SXED, s.EIDOS_SXED_ID, s.TITLOS_ERG, s.TITLOS_SXED,
                      s.PERIGRAFH_SXED, s.PERIGRAFH_ERG, s.YPOKAT_ERG_ID, s.HMER, s.XOROS_APOTH_ID, s.KATHG_ERG_ID,
                      s.HSTR_ID, s.DATE_INS, s.USER_INS, s.MAZIKI_KATAXWRISI
                 from {_owner}.C16PE_SXEDIO s where s.SXEDIO_ID = :id", args, ct, tx));
        if (archived == 0)
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        await con.ExecuteAsync(Cmd(
            $"delete from {_owner}.C16PE_SXEDIO where SXEDIO_ID = :id", args, ct, tx));
        await tx.CommitAsync(ct);
        return true;
    }
}
