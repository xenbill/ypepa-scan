import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Spinner } from './components/Loading'
import { getLookups, hasRight, searchDrawings, type Sort, type UserInfo } from './api/api'
import { emptyFilters, type Filters } from './api/types'
import ComboSelect from './components/ComboSelect'
import ResultsTable from './components/ResultsTable'
import ImportForm from './components/ImportForm'
import MassImportForm from './components/MassImportForm'

const PAGE_SIZES = [10, 20, 50, 100] // server clamps to 100
const PAGE_SIZE_KEY = 'ypepascan.pageSize'
function loadPageSize(): number {
  try {
    const v = Number(localStorage.getItem(PAGE_SIZE_KEY))
    return PAGE_SIZES.includes(v) ? v : 10
  } catch { return 10 } // storage disabled/full: just use the default
}


const FILTER_KEYS = Object.keys(emptyFilters) as (keyof Filters)[]

/** Filters/sort/page live in the URL (?q=…&kathg=…&sortBy=…&page=…): the browser
    back button, a bookmark, or "Κλείσιμο" in the viewer all restore the same list. */
function readListState(params: URLSearchParams) {
  const filters = { ...emptyFilters }
  for (const k of FILTER_KEYS) filters[k] = params.get(k) ?? ''
  const sortBy = params.get('sortBy')
  const sortDir = params.get('sortDir')
  const sort: Sort | null = sortBy ? { key: sortBy, dir: sortDir === 'desc' ? 'desc' : 'asc' } : null
  const page = Math.max(1, Number(params.get('page')) || 1)
  return { filters, sort, page }
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { filters, sort, page } = useMemo(() => readListState(params), [params])
  const [draftQ, setDraftQ] = useState(filters.q)
  useEffect(() => { setDraftQ(filters.q) }, [filters.q]) // back/forward changed q under us
  const [pageSize, setPageSize] = useState(loadPageSize)
  function changePageSize(n: number) {
    setPageSize(n)
    setPage(1)
    try { localStorage.setItem(PAGE_SIZE_KEY, String(n)) } catch { /* ignore */ }
  }
  const user = useOutletContext<UserInfo>()
  const canScan = hasRight(user, 'SCAN')
  const [showImport, setShowImport] = useState(canScan && params.get('import') === '1')
  const [showMassImport, setShowMassImport] = useState(canScan && params.get('import') === 'mass')

  // Writes filters/sort/page back to the URL. `replace` so tweaking filters doesn't
  // pile up history entries — Back goes to the previous *page*, not the previous filter.
  function writeListState(next: { filters?: Filters; sort?: Sort | null; page?: number }) {
    const f = next.filters ?? filters
    const s = next.sort === undefined ? sort : next.sort
    const p = next.page ?? page
    const out = new URLSearchParams()
    for (const k of FILTER_KEYS) if (f[k]) out.set(k, f[k])
    if (s) { out.set('sortBy', s.key); out.set('sortDir', s.dir) }
    if (p > 1) out.set('page', String(p))
    setParams(out, { replace: true })
  }
  const setPage = (p: number) => writeListState({ page: p })
  const openDrawing = (id: number) =>
    navigate(`/drawings/${id}`, { state: { from: location.search } })

  const lookupsQuery = useQuery({ queryKey: ['lookups'], queryFn: ({ signal }) => getLookups(signal), staleTime: Infinity })
  const lookups = lookupsQuery.data

  const searchQuery = useQuery({
    queryKey: ['drawings', filters, sort, page, pageSize],
    queryFn: ({ signal }) => searchDrawings(filters, sort, page, pageSize, signal),
    placeholderData: keepPreviousData,
  })
  const result = searchQuery.data
  // First load => skeleton rows; later loads (filters/page/sort) => old rows dimmed.
  const initialLoading = searchQuery.isPending
  const refetching = searchQuery.isFetching && !initialLoading

  const error = lookupsQuery.error ?? searchQuery.error

  function apply(next: Filters) {
    writeListState({ filters: next, page: 1 })
  }

  function toggleSort(key: string) {
    const next: Sort | null = sort?.key !== key
      ? { key, dir: 'asc' }
      : sort.dir === 'asc' ? { key, dir: 'desc' } : null
    writeListState({ sort: next, page: 1 })
  }

  const setFilter = (key: keyof Filters) => (id: string) => {
    const next = { ...filters, [key]: id }
    if (key === 'kathg') next.ypokat = ''
    apply(next)
  }

  const ypokatOptions = (lookups?.ypokatErg ?? []).filter(
    (y) => !filters.kathg || y.parentId === Number(filters.kathg),
  )
  const pages = result ? Math.max(1, Math.ceil(result.total / pageSize)) : 1

  return (
    <>
      <div className="list-head">
        <h2 className="page-title">Σχέδια</h2>
        {canScan && (
          <span className="list-head-actions">
            <button onClick={() => setShowMassImport(true)}>Μαζική καταχώριση</button>{' '}
            <button className="primary" onClick={() => setShowImport(true)}>+ Καταχώριση σχεδίου</button>
          </span>
        )}
      </div>
      <section className="card filters">
        <div className="filters-title">Αναζήτηση</div>
        <div className="filter-grid">
          <label className="field field-search">
            <span>Κείμενο</span>
            <input
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply({ ...filters, q: draftQ })}
              placeholder="Αριθμός σχεδίου, κωδικός έργου, τίτλος, περιγραφή…"
            />
          </label>
          <label className="field">
            <span>Εισαγωγή από</span>
            <input type="date" value={filters.insFrom}
                   onChange={(e) => apply({ ...filters, insFrom: e.target.value })} />
          </label>
          <label className="field">
            <span>Εισαγωγή έως</span>
            <input type="date" value={filters.insTo}
                   onChange={(e) => apply({ ...filters, insTo: e.target.value })} />
          </label>
          <div className="filter-buttons">
            <button className="primary" onClick={() => apply({ ...filters, q: draftQ })}>Αναζήτηση</button>
            <button onClick={() => { setDraftQ(''); apply(emptyFilters) }}>Καθαρισμός</button>
          </div>
          <div className="field">
            <span>Κατηγορία έργου</span>
            <ComboSelect options={lookups?.kathgoriaErg ?? []} value={filters.kathg} allLabel="Όλες" onChange={setFilter('kathg')} />
          </div>
          <div className="field">
            <span>Υποκατηγορία</span>
            <ComboSelect options={ypokatOptions} value={filters.ypokat} allLabel="Όλες" onChange={setFilter('ypokat')} />
          </div>
          <div className="field">
            <span>Μονάδα</span>
            <ComboSelect options={lookups?.monadaInUse ?? []} value={filters.hstr} allLabel="Όλες" onChange={setFilter('hstr')} />
          </div>
          <div className="field">
            <span>Είδος σχεδίου</span>
            <ComboSelect options={lookups?.eidosSxed ?? []} value={filters.eidos} allLabel="Όλα" onChange={setFilter('eidos')} />
          </div>
          <div className="field">
            <span>Χώρος αποθήκευσης</span>
            <ComboSelect options={lookups?.xorosApoth ?? []} value={filters.xoros} allLabel="Όλοι" onChange={setFilter('xoros')} />
          </div>
        </div>
      </section>

      {error != null && <p className="status-err">Σφάλμα: {(error as Error).message}</p>}

      <section className={'card table-card' + (refetching ? ' is-refetching' : '')} aria-busy={searchQuery.isFetching}>
        {refetching && <div className="table-busy"><Spinner size={13} /> Αναζήτηση…</div>}
        <ResultsTable
          items={result?.items ?? []}
          sort={sort}
          onToggleSort={toggleSort}
          onOpen={openDrawing}
          loading={initialLoading}
        />
        {result?.items.length === 0 && (
          <div className="empty-note">
            <svg width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="70" height="54" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <rect x="7.5" y="7.5" width="57" height="41" stroke="currentColor" opacity="0.45" />
              <rect x="42.5" y="38.5" width="22" height="10" stroke="currentColor" opacity="0.7" />
              <path d="M15 18h24M15 25h30M15 32h18" stroke="currentColor" opacity="0.45" />
            </svg>
            <p><strong>Δεν βρέθηκαν σχέδια</strong></p>
            <p>Δοκιμάστε λιγότερα φίλτρα ή διαφορετικό κείμενο αναζήτησης.</p>
            <button onClick={() => { setDraftQ(''); apply(emptyFilters) }}>Καθαρισμός φίλτρων</button>
          </div>
        )}
      </section>

      {result && (
        <div className={'pager' + (refetching ? ' is-refetching' : '')}>
          <button disabled={page <= 1 || refetching} onClick={() => setPage(page - 1)}>‹ Προηγούμενη</button>
          <span>Σελίδα {page} / {pages} — {result.total} σχέδια</span>
          <button disabled={page >= pages || refetching} onClick={() => setPage(page + 1)}>Επόμενη ›</button>
          <label className="pager-size">
            Ανά σελίδα{' '}
            <select value={pageSize} disabled={refetching} onChange={(e) => changePageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {canScan && showImport && lookups && (
        <ImportForm lookups={lookups} onClose={() => setShowImport(false)} />
      )}
      {canScan && showMassImport && lookups && (
        <MassImportForm lookups={lookups} onClose={() => setShowMassImport(false)} />
      )}
    </>
  )
}
