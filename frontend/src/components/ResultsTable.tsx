import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton } from './Loading'
import { formatDate, type Sort } from '../api/api'
import type { DrawingRow } from '../api/types'

const SKELETON_WIDTHS = ['70%', '45%', '85%', '60%', '50%', '78%']

// Column set and order mirror the legacy "Αναζήτηση σχεδίων" list.
export const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
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

const WIDTHS_KEY = 'ypepascan.colWidths'
const MIN_WIDTH = 60

type Widths = Record<string, number>

/** Column widths the user dragged, remembered per browser (like theme/page size). */
function loadWidths(): Widths {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Widths
    // Keep only known columns with sane numbers — stale/garbage entries are dropped.
    const clean: Widths = {}
    for (const c of COLUMNS)
      if (typeof parsed[c.key] === 'number' && parsed[c.key] >= MIN_WIDTH) clean[c.key] = parsed[c.key]
    return clean
  } catch { return {} } // storage disabled or corrupt: automatic widths
}

type Props = {
  items: DrawingRow[]
  sort: Sort | null
  onToggleSort: (key: string) => void
  onOpen: (id: number) => void
  loading: boolean
}

/**
 * The results list. Columns size themselves automatically (as before) until the
 * user drags the grip on a header's right edge; from then on the dragged widths
 * win and are remembered in this browser. Double-click a grip to let that column
 * size itself again.
 */
export default function ResultsTable({ items, sort, onToggleSort, onOpen, loading }: Props) {
  const [widths, setWidths] = useState<Widths>(loadWidths)
  const tableRef = useRef<HTMLTableElement>(null)
  const drag = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // A drag releases the mouse outside the grip, so the browser fires `click` on
  // the shared ancestor (the <th>) — which would sort the column. This swallows
  // that one click; stopPropagation on the grip alone cannot.
  const swallowClick = useRef(false)

  const persist = useCallback((next: Widths) => {
    setWidths(next)
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  // Drag lives on the document so the pointer can leave the 6px grip (and the
  // table) without the resize sticking.
  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const d = drag.current
      if (!d) return
      const w = Math.max(MIN_WIDTH, Math.round(d.startWidth + (e.clientX - d.startX)))
      setWidths((prev) => (prev[d.key] === w ? prev : { ...prev, [d.key]: w }))
      e.preventDefault() // don't select text while dragging
    }
    function onUp() {
      drag.current = null
      setDragging(false)
      swallowClick.current = true
      setTimeout(() => { swallowClick.current = false }, 0) // after this click event
      setWidths((prev) => {
        try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(prev)) } catch { /* ignore */ }
        return prev
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  function startDrag(e: React.MouseEvent, key: string, index: number) {
    e.preventDefault()
    e.stopPropagation() // never let the grip trigger the header's sort
    const th = tableRef.current?.querySelectorAll('thead th')[index] as HTMLElement | undefined
    drag.current = { key, startX: e.clientX, startWidth: widths[key] ?? th?.offsetWidth ?? 120 }
    setDragging(true)
  }

  function resetColumn(e: React.MouseEvent, key: string) {
    e.preventDefault()
    e.stopPropagation()
    const next = { ...widths }
    delete next[key]
    persist(next)
  }

  // Fixed layout only once something was dragged: untouched tables keep the
  // browser's automatic, content-driven sizing.
  const resized = Object.keys(widths).length > 0

  return (
    <>
      {resized && (
        <div className="cols-reset">
          <button type="button" onClick={() => persist({})}
                  title="Επαναφέρει όλες τις στήλες σε αυτόματο πλάτος">
            Επαναφορά πλάτους στηλών
          </button>
        </div>
      )}
      <div className="table-scroll">
      <table ref={tableRef} className={'results' + (resized ? ' is-resized' : '') + (dragging ? ' is-dragging' : '')}>
        {resized && (
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={widths[c.key] ? { width: widths[c.key] } : undefined} />)}
            <col />
          </colgroup>
        )}
        <thead>
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={c.key}
                  className={c.sortable ? 'sortable' : undefined}
                  onClick={c.sortable ? () => { if (!swallowClick.current) onToggleSort(c.key) } : undefined}>
                <span className="th-label">{c.label}</span>
                {sort?.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                <span className="col-grip"
                      role="separator"
                      aria-orientation="vertical"
                      title="Σύρετε για αλλαγή πλάτους (διπλό κλικ: αυτόματο)"
                      onMouseDown={(e) => startDrag(e, c.key, i)}
                      onDoubleClick={(e) => resetColumn(e, c.key)}
                      onClick={(e) => e.stopPropagation()} />
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 8 }, (_, i) => (
            <tr key={'sk' + i} className="skeleton-row" aria-hidden="true">
              {COLUMNS.map((c, j) => (
                <td key={c.key}><Skeleton width={SKELETON_WIDTHS[(i + j) % SKELETON_WIDTHS.length]} height={12} /></td>
              ))}
              <td><Skeleton width={64} height={22} /></td>
            </tr>
          ))}
          {items.map((d) => (
            <tr key={d.sxedioId}>
              <td className="mono">{d.kodikosErg}</td>
              <td>
                <a className="mono" href={`/drawings/${d.sxedioId}`}
                   onClick={(e) => { e.preventDefault(); onOpen(d.sxedioId) }}>
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
                <button onClick={() => onOpen(d.sxedioId)}>Προβολή</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  )
}
