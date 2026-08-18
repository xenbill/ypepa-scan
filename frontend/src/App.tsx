import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  formatDate, getLookups, searchDrawings,
  UnauthorizedError, type Sort,
} from './api'
import { emptyFilters, type Filters } from './types'
import ComboSelect from './ComboSelect'
import ImportForm from './ImportForm'

const PAGE_SIZE = 20

// Column set and order mirror the legacy "Αναζήτηση σχεδίων" list.
const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'kodikosErg', label: 'Κωδ. Έργου', sortable: true },
  { key: 'arithmosSxed', label: 'Αρ. Σχεδίου', sortable: true },
  { key: 'kathgoriaErg', label: 'Κατηγορία', sortable: true },
  { key: 'ypokathgoriaErg', label: 'Υποκατηγορία', sortable: true },
  { key: 'monada', label: 'Μονάδα', sortable: true },
  { key: 'titlosErg', label: 'Υπομονάδα', sortable: true },
  { key: 'titlosSxed', label: 'Τίτλος Σχεδ.', sortable: true },
  { key: 'eidosSxed', label: 'Είδος Σχεδίου', sortable: true },
  { key: 'xorosApoth', label: 'Αποθήκ.', sortable: true },
  { key: 'perigrafhSxed', label: 'Περιγραφή Σχεδίου', sortable: true },
  { key: 'perigrafhErg', label: 'Περιγραφή Έργου', sortable: true },
  { key: 'dateIns', label: 'Εισαγωγή', sortable: true },
]

export default function App() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [draftQ, setDraftQ] = useState('')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<Sort | null>(null)
  const [page, setPage] = useState(1)
  const [showImport, setShowImport] = useState(params.get('import') === '1')

  const lookupsQuery = useQuery({ queryKey: ['lookups'], queryFn: getLookups, staleTime: Infinity })
  const lookups = lookupsQuery.data

  const searchQuery = useQuery({
    queryKey: ['drawings', filters, sort, page],
    queryFn: () => searchDrawings(filters, sort, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  const result = searchQuery.data

  const error = lookupsQuery.error ?? searchQuery.error
  if (error instanceof UnauthorizedError) return <Navigate to="/login" replace />

  function apply(next: Filters) {
    setFilters(next)
    setPage(1)
  }

  function toggleSort(key: string) {
    setPage(1)
    setSort((s) => s?.key !== key
      ? { key, dir: 'asc' }
      : s.dir === 'asc' ? { key, dir: 'desc' } : null)
  }

  const setFilter = (key: keyof Filters) => (id: string) => {
    const next = { ...filters, [key]: id }
    if (key === 'kathg') next.ypokat = ''
    apply(next)
  }

  const ypokatOptions = (lookups?.ypokatErg ?? []).filter(
    (y) => !filters.kathg || y.parentId === Number(filters.kathg),
  )
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <>
      <div className="list-head">
        <h2 className="page-title">Σχέδια</h2>
        <button className="primary" onClick={() => setShowImport(true)}>+ Καταχώριση σχεδίου</button>
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
            <ComboSelect options={lookups?.monada ?? []} value={filters.hstr} allLabel="Όλες" onChange={setFilter('hstr')} />
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

      <section className="card table-card">
        <div className="table-scroll">
          <table className="results">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key}
                      className={c.sortable ? 'sortable' : undefined}
                      onClick={c.sortable ? () => toggleSort(c.key) : undefined}>
                    {c.label}
                    {sort?.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(result?.items ?? []).map((d) => (
                <tr key={d.sxedioId}>
                  <td className="mono">{d.kodikosErg}</td>
                  <td>
                    <a className="mono" href={`/sxedio/${d.sxedioId}`}
                       onClick={(e) => { e.preventDefault(); navigate(`/sxedio/${d.sxedioId}`) }}>
                      {d.arithmosSxed || '—'}
                    </a>
                  </td>
                  <td>{d.kathgoriaErg}</td>
                  <td>{d.ypokathgoriaErg}</td>
                  <td>{d.monada}</td>
                  <td className="trunc" title={d.titlosErg ?? ''}>{d.titlosErg}</td>
                  <td className="trunc" title={d.titlosSxed ?? ''}>{d.titlosSxed}</td>
                  <td>{d.eidosSxed && <span className="badge">{d.eidosSxed}</span>}</td>
                  <td>{d.xorosApoth}</td>
                  <td className="trunc" title={d.perigrafhSxed ?? ''}>{d.perigrafhSxed}</td>
                  <td className="trunc" title={d.perigrafhErg ?? ''}>{d.perigrafhErg}</td>
                  <td className="mono">{formatDate(d.dateIns)}</td>
                  <td>
                    <button onClick={() => navigate(`/sxedio/${d.sxedioId}`)}>Προβολή</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <div className="pager">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Προηγούμενη</button>
          <span>Σελίδα {page} / {pages} — {result.total} σχέδια</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Επόμενη ›</button>
        </div>
      )}

      {showImport && lookups && (
        <ImportForm lookups={lookups} onClose={() => setShowImport(false)} />
      )}
    </>
  )
}
