import { PAGE_SIZES } from './useListState'

/** Previous / next + «Ανά σελίδα». Everything is disabled mid-refetch so a second
    click can't queue a page the user never saw. */
export default function Pager({ page, pages, total, pageSize, busy, onPage, onPageSize }: {
  page: number
  pages: number
  total: number
  pageSize: number
  busy: boolean
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  return (
    <div className={'pager' + (busy ? ' is-refetching' : '')}>
      <button disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>‹ Προηγούμενη</button>
      <span>Σελίδα {page} / {pages} — {total} σχέδια</span>
      <button disabled={page >= pages || busy} onClick={() => onPage(page + 1)}>Επόμενη ›</button>
      <label className="pager-size">
        Ανά σελίδα{' '}
        <select value={pageSize} disabled={busy} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  )
}
