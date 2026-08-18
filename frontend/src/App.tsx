import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  downloadFile, formatDate, getLookups, searchDrawings,
  UnauthorizedError, type Sort,
} from './api'
import { emptyFilters, type Filters, type Lookup } from './types'
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

  const setFilter = (key: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = { ...filters, [key]: e.target.value }
    if (key === 'kathg') next.ypokat = ''
    apply(next)
  }

  const ypokatOptions = (lookups?.ypokatErg ?? []).filter(
    (y) => !filters.kathg || y.parentId === Number(filters.kathg),
  )
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  const options = (items: Lookup[], all: string) => [
    <option key="" value="">{all}</option>,
    ...items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>),
  ]

  return (
    <>
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
            <span className="spacer" />
            <button className="primary" onClick={() => setShowImport(true)}>+ Καταχώριση</button>
          </div>
          <label className="field">
            <span>Κατηγορία έργου</span>
            <select value={filters.kathg} onChange={setFilter('kathg')}>{options(lookups?.kathgoriaErg ?? [], 'Όλες')}</select>
          </label>
          <label className="field">
            <span>Υποκατηγορία</span>
            <select value={filters.ypokat} onChange={setFilter('ypokat')}>{options(ypokatOptions, 'Όλες')}</select>
          </label>
          <label className="field">
            <span>Μονάδα</span>
            <select value={filters.hstr} onChange={setFilter('hstr')}>{options(lookups?.monada ?? [], 'Όλες')}</select>
          </label>
          <label className="field">
            <span>Είδος σχεδίου</span>
            <select value={filters.eidos} onChange={setFilter('eidos')}>{options(lookups?.eidosSxed ?? [], 'Όλα')}</select>
          </label>
          <label className="field">
            <span>Τοποθέτηση</span>
            <select value={filters.xoros} onChange={setFilter('xoros')}>{options(lookups?.xorosApoth ?? [], 'Όλοι')}</select>
          </label>
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
                  <td>{d.kodikosErg}</td>
                  <td>
                    <a href={`/sxedio/${d.sxedioId}`}
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
                  <td>{formatDate(d.dateIns)}</td>
                  <td>
                    <button onClick={() => navigate(`/sxedio/${d.sxedioId}`)}>Προβολή</button>{' '}
                    <button onClick={() => downloadFile(d.sxedioId)}>Λήψη</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result?.items.length === 0 && (
          <div className="empty-note">Δεν βρέθηκαν σχέδια με αυτά τα κριτήρια.</div>
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
