import { useState } from 'react'
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Spinner } from '../components/Loading'
import { hasRight, type UserInfo } from '../api/auth'
import { searchDrawings } from '../api/drawings'
import { getLookups } from '../api/lookups'
import ImportForm from './import/ImportForm'
import MassImportForm from './import/MassImportForm'
import DrawingFilters from './DrawingFilters'
import EmptyResults from './EmptyResults'
import Pager from './Pager'
import ResultsTable from './ResultsTable'
import { useListState } from './useListState'

/** «Σχέδια» — the search screen: filters, the results table, the pager, and the
    two import dialogs. The list state itself lives in useListState (the URL). */
export default function DrawingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const list = useListState()
  const { filters, sort, page, pageSize } = list

  const user = useOutletContext<UserInfo>()
  const canScan = hasRight(user, 'SCAN')
  const [showImport, setShowImport] = useState(canScan && params.get('import') === '1')
  const [showMassImport, setShowMassImport] = useState(canScan && params.get('import') === 'mass')

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

      <DrawingFilters lookups={lookups} list={list} />

      {error != null && <p className="status-err">Σφάλμα: {(error as Error).message}</p>}

      <section className={'card table-card' + (refetching ? ' is-refetching' : '')} aria-busy={searchQuery.isFetching}>
        {refetching && <div className="table-busy"><Spinner size={13} /> Αναζήτηση…</div>}
        <ResultsTable
          items={result?.items ?? []}
          sort={sort}
          onToggleSort={list.toggleSort}
          onOpen={(id) => navigate(`/drawings/${id}`, { state: { from: location.search } })}
          loading={initialLoading}
        />
        {result?.items.length === 0 && <EmptyResults onClear={list.reset} />}
      </section>

      {result && (
        <Pager page={page} pages={pages} total={result.total} pageSize={pageSize}
               busy={refetching} onPage={list.setPage} onPageSize={list.setPageSize} />
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
