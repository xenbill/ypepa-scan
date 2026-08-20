import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { emptyFilters, type Filters } from '../api/types'
import type { Sort } from '../api/drawings'
import { readStored, writeStored } from '../lib/storage'

export const PAGE_SIZES = [10, 20, 50, 100] // server clamps to 100
const PAGE_SIZE_KEY = 'ypepascan.pageSize'
const FILTER_KEYS = Object.keys(emptyFilters) as (keyof Filters)[]

function loadPageSize(): number {
  const v = readStored(PAGE_SIZE_KEY, (raw) => Number(raw))
  return v != null && PAGE_SIZES.includes(v) ? v : 10
}

function readListState(params: URLSearchParams) {
  const filters = { ...emptyFilters }
  for (const k of FILTER_KEYS) filters[k] = params.get(k) ?? ''
  const sortBy = params.get('sortBy')
  const sortDir = params.get('sortDir')
  const sort: Sort | null = sortBy ? { key: sortBy, dir: sortDir === 'desc' ? 'desc' : 'asc' } : null
  const page = Math.max(1, Number(params.get('page')) || 1)
  return { filters, sort, page }
}

/**
 * Filters/sort/page live in the URL (?q=…&kathg=…&sortBy=…&page=…): the browser
 * back button, a bookmark, or "Κλείσιμο" in the viewer all restore the same list.
 * Page size is a per-browser preference instead — it says how you like to read
 * lists, not which list you are looking at — so it stays in localStorage.
 *
 * `draftQ` is the text box: it only becomes a filter on Enter / «Αναζήτηση», so
 * typing doesn't fire a search per keystroke.
 */
export function useListState() {
  const [params, setParams] = useSearchParams()
  const { filters, sort, page } = useMemo(() => readListState(params), [params])
  const [draftQ, setDraftQ] = useState(filters.q)
  useEffect(() => { setDraftQ(filters.q) }, [filters.q]) // back/forward changed q under us
  const [pageSize, setPageSizeState] = useState(loadPageSize)

  // `replace` so tweaking filters doesn't pile up history entries — Back goes to
  // the previous *page*, not the previous filter.
  function write(next: { filters?: Filters; sort?: Sort | null; page?: number }) {
    const f = next.filters ?? filters
    const s = next.sort === undefined ? sort : next.sort
    const p = next.page ?? page
    const out = new URLSearchParams()
    for (const k of FILTER_KEYS) if (f[k]) out.set(k, f[k])
    if (s) { out.set('sortBy', s.key); out.set('sortDir', s.dir) }
    if (p > 1) out.set('page', String(p))
    setParams(out, { replace: true })
  }

  const apply = (next: Filters) => write({ filters: next, page: 1 })

  return {
    filters, sort, page, pageSize, draftQ, setDraftQ,
    apply,
    /** Changing one lookup filter; picking a category drops the subcategory under it. */
    setFilter: (key: keyof Filters) => (id: string) => {
      const next = { ...filters, [key]: id }
      if (key === 'kathg') next.ypokat = ''
      apply(next)
    },
    /** Same column again: asc → desc → unsorted. */
    toggleSort: (key: string) => {
      const next: Sort | null = sort?.key !== key
        ? { key, dir: 'asc' }
        : sort.dir === 'asc' ? { key, dir: 'desc' } : null
      write({ sort: next, page: 1 })
    },
    setPage: (p: number) => write({ page: p }),
    setPageSize: (n: number) => {
      setPageSizeState(n)
      write({ page: 1 })
      writeStored(PAGE_SIZE_KEY, String(n))
    },
    reset: () => { setDraftQ(''); apply(emptyFilters) },
    search: () => apply({ ...filters, q: draftQ }),
  }
}
