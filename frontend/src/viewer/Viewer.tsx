import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import OpenSeadragon from 'openseadragon'
import { deleteDrawing, downloadFile, formatDate, formatFileType, formatMb, getDrawing, getLookups, getViewInfo, updateDrawing, UnauthorizedError } from '../api/api'
import { SkeletonLines, Spinner } from '../components/Loading'
import { NotFoundError } from '../api/api'
import { StatusPage } from '../pages/StatusPage'
import ComboSelect from '../components/ComboSelect'
import ConfirmModal from '../components/ConfirmModal'
import type { DrawingMeta, DrawingRow, LookupData } from '../api/types'

interface ViewerProps {
  id: number
  onClose: () => void
}

export default function Viewer({ id, onClose }: ViewerProps) {
  const osdRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const queryClient = useQueryClient()

  // Download: fetches the whole file before the browser's save dialog appears, so
  // the button must show it's working (and refuse a second click meanwhile).
  const download = useMutation({ mutationFn: () => downloadFile(id) })

  const deleteMutation = useMutation({
    mutationFn: () => deleteDrawing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      queryClient.removeQueries({ queryKey: ['drawing', id] })
      onClose()
    },
  })

  const drawingQuery = useQuery({ queryKey: ['drawing', id], queryFn: ({ signal }) => getDrawing(id, signal) })
  const lookupsQuery = useQuery({ queryKey: ['lookups'], queryFn: ({ signal }) => getLookups(signal), staleTime: Infinity })
  // The server caches pyramids on disk; only refetched if tiles start failing
  // (the pyramid was evicted while this viewer was open) — see below.
  const viewQuery = useQuery({
    queryKey: ['view', id],
    queryFn: ({ signal }) => getViewInfo(id, signal),
    staleTime: Infinity,
    retry: false,
  })
  const drawing = drawingQuery.data
  const info = viewQuery.data
  // A regenerated pyramid has the same URLs, so key the OSD re-init on fetch time.
  const infoVersion = viewQuery.dataUpdatedAt

  useEffect(() => {
    if (!info || info.type === 'pdf' || !osdRef.current) return
    const viewer = OpenSeadragon({
      element: osdRef.current,
      tileSources: info.url,
      prefixUrl: '',
      showNavigationControl: false,
      maxZoomPixelRatio: 3,
      minZoomImageRatio: 0.8,
      visibilityRatio: 1,
    })
    viewerRef.current = viewer
    // Self-heal: if the pyramid was evicted from the server cache while we were
    // viewing it, tiles start 404-ing. Ask the server to regenerate it (once) and
    // re-render with the fresh info instead of leaving grey squares until reload.
    let healed = false
    const heal = () => {
      if (healed) return
      healed = true
      queryClient.invalidateQueries({ queryKey: ['view', id] })
    }
    viewer.addHandler('tile-load-failed', heal)
    viewer.addHandler('open-failed', heal)
    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, infoVersion, id, queryClient])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const zoom = (f: number) => viewerRef.current?.viewport.zoomBy(f).applyConstraints()

  const rotate = (delta: number) => {
    const vp = viewerRef.current?.viewport
    if (vp) vp.setRotation(vp.getRotation() + delta)
  }

  const fit = () => {
    const vp = viewerRef.current?.viewport
    if (vp) {
      vp.setRotation(0)
      vp.goHome()
    }
  }

  // Grouped like the legacy Σχέδια ΥΠΕΠΑ edit screen.
  const sections: [string, [string, string | null][]][] = drawing
    ? [
        ['Σχέδιο', [
          ['Αριθμός σχεδίου', drawing.arithmosSxed],
          ['Είδος σχεδίου', drawing.eidosSxed],
          ['Τίτλος σχεδίου', drawing.titlosSxed],
          ['Περιγραφή σχεδίου', drawing.perigrafhSxed],
        ]],
        ['Έργο', [
          ['Κωδικός έργου', drawing.kodikosErg],
          ['Κατηγορία έργου', drawing.kathgoriaErg],
          ['Υποκατηγορία έργου', drawing.ypokathgoriaErg],
          ['Περιγραφή έργου', drawing.perigrafhErg],
          ['Μονάδα', drawing.monada],
          ['Υπομονάδα', drawing.titlosErg],
        ]],
        ['Πρόσθετες πληροφορίες', [
          ['Χώρος αποθήκευσης', drawing.xorosApoth],
          ['Ημερομηνία', formatDate(drawing.hmer)],
          ['Εισαγωγή στη ΒΔ', formatDate(drawing.dateIns)],
          ['Χρήστης', drawing.userIns],
          ['Τύπος αρχείου', formatFileType(drawing.fileType)],
          ['Μέγεθος αρχείου', formatMb(drawing.sizeBytes)],
          ['Μαζική καταχώρηση', drawing.mazikiKataxwrisi ? 'Ναι' : 'Όχι'],
        ]],
      ]
    : []

  // Deleted / never existed: a clear page instead of an empty viewer with two error lines.
  if (drawingQuery.error instanceof NotFoundError) {
    return (
      <div className="viewer">
        <div className="viewer-head">
          <strong>#{id}</strong>
          <span className="viewer-title" />
          <span className="viewer-buttons"><button onClick={onClose}>Κλείσιμο</button></span>
        </div>
        <div className="viewer-body viewer-body-status">
          <StatusPage code="404" title={`Το σχέδιο #${id} δεν βρέθηκε`}
                      message="Μπορεί να έχει διαγραφεί ή ο σύνδεσμος να είναι λάθος.">
            <button className="primary" onClick={onClose}>Επιστροφή στη λίστα</button>
          </StatusPage>
        </div>
      </div>
    )
  }

  return (
    <div className="viewer">
      <div className="viewer-head">
        <strong>{drawing?.arithmosSxed ?? `#${id}`}</strong>
        <span className="viewer-title">
          {[drawing?.titlosSxed, drawing?.titlosErg].filter(Boolean).join(' — ')}
        </span>
        <span className="viewer-buttons">
          {info?.type !== 'pdf' && (
            <>
              <span className="btn-group">
                <button onClick={() => zoom(1 / 1.5)} title="Σμίκρυνση">−</button>
                <button onClick={() => zoom(1.5)} title="Μεγέθυνση">+</button>
              </span>
              <span className="btn-group">
                <button onClick={() => rotate(-90)} title="Περιστροφή αριστερά">⟲ 90°</button>
                <button onClick={() => rotate(90)} title="Περιστροφή δεξιά">⟳ 90°</button>
              </span>
              <button onClick={fit}>Προσαρμογή</button>
            </>
          )}
          <button className={download.isPending ? 'btn-busy' : undefined} disabled={download.isPending}
                  onClick={() => download.mutate()}>
            {download.isPending && <Spinner size={13} />}
            {download.isPending ? 'Λήψη…' : 'Λήψη πρωτοτύπου'}
          </button>
          <button className="danger" onClick={() => setConfirmDelete(true)}>Διαγραφή</button>
          <button onClick={onClose}>Κλείσιμο</button>
        </span>
      </div>
      <div className="viewer-body">
        {viewQuery.isError && (
          <div className="viewer-message">Σφάλμα: {(viewQuery.error as Error).message}</div>
        )}
        {viewQuery.isPending && (
          <div className="viewer-message">
            <Spinner size={28} />
            Προετοιμασία σχεδίου… (την πρώτη φορά χρειάζεται λίγα δευτερόλεπτα)
          </div>
        )}
        {download.isError && (
          <div className="viewer-toast status-err">
            {download.error instanceof UnauthorizedError ? 'Η σύνδεση έληξε — συνδεθείτε ξανά.' : (download.error as Error).message}
            {' '}<button onClick={() => download.reset()}>×</button>
          </div>
        )}
        {info?.type === 'pdf'
          ? <iframe className="viewer-canvas" title="PDF" src={info.url} />
          : <div className="viewer-canvas" ref={osdRef} style={{ visibility: info ? 'visible' : 'hidden' }} />}
        <div className="viewer-meta">
          <div className="meta-head">
            <h3>Στοιχεία σχεδίου</h3>
            {!editing && drawing && (
              <button onClick={() => setEditing(true)}>Επεξεργασία</button>
            )}
          </div>
          {editing && drawing && lookupsQuery.data ? (
            <MetaEditForm
              drawing={drawing}
              lookups={lookupsQuery.data}
              onDone={() => setEditing(false)}
            />
          ) : drawingQuery.isPending ? (
            <>
              <div className="meta-section"><h4>Σχέδιο</h4><SkeletonLines rows={4} /></div>
              <div className="meta-section"><h4>Έργο</h4><SkeletonLines rows={5} /></div>
              <div className="meta-section"><h4>Πρόσθετες πληροφορίες</h4><SkeletonLines rows={5} /></div>
            </>
          ) : drawingQuery.isError ? (
            <p className="status-err">Σφάλμα: {(drawingQuery.error as Error).message}</p>
          ) : (
            sections.filter(([, rows]) => rows.some(([, v]) => v)).map(([title, rows]) => (
              <div key={title} className="meta-section">
                <h4>{title}</h4>
                <table>
                  <tbody>
                    {rows.filter(([, v]) => v).map(([k, v]) => (
                      <tr key={k}><th>{k}</th><td>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Διαγραφή σχεδίου"
          message={`Το σχέδιο ${drawing?.arithmosSxed ?? `#${id}`} θα διαγραφεί από το αρχείο. Θέλετε να συνεχίσετε;`}
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function MetaEditForm({ drawing, lookups, onDone }: {
  drawing: DrawingRow
  lookups: LookupData
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<DrawingMeta>({
    kodikosErg: drawing.kodikosErg,
    arithmosSxed: drawing.arithmosSxed,
    titlosErg: drawing.titlosErg,
    titlosSxed: drawing.titlosSxed,
    perigrafhSxed: drawing.perigrafhSxed,
    perigrafhErg: drawing.perigrafhErg,
    hmer: drawing.hmer ? drawing.hmer.slice(0, 10) : null,
    eidosId: drawing.eidosSxedId,
    kathgId: drawing.kathgErgId,
    ypokatId: drawing.ypokatErgId,
    xorosId: drawing.xorosApothId,
    hstrId: drawing.hstrId,
  })

  const mutation = useMutation({
    mutationFn: () => updateDrawing(drawing.sxedioId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawing', drawing.sxedioId] })
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      onDone()
    },
  })

  const text = (key: keyof DrawingMeta) => ({
    value: (form[key] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value || null }),
  })

  const num = (key: 'eidosId' | 'kathgId' | 'ypokatId' | 'xorosId' | 'hstrId') => ({
    value: form[key] != null ? String(form[key]) : '',
    allLabel: '—',
    onChange: (id: string) => {
      const next = { ...form, [key]: id ? Number(id) : null }
      if (key === 'kathgId') next.ypokatId = null
      setForm(next)
    },
  })

  const ypokat = lookups.ypokatErg.filter((y) => !form.kathgId || y.parentId === form.kathgId)

  return (
    <form
      className="meta-form"
      onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}
    >
      <div className="meta-section">
        <h4>Σχέδιο</h4>
        <label>Αριθμός σχεδίου<input required maxLength={50} {...text('arithmosSxed')} /></label>
        <label>Είδος σχεδίου<ComboSelect options={lookups.eidosSxed} {...num('eidosId')} /></label>
        <label>Τίτλος σχεδίου<input maxLength={500} {...text('titlosSxed')} /></label>
        <label>Περιγραφή σχεδίου<textarea rows={2} maxLength={2000} {...text('perigrafhSxed')} /></label>
      </div>
      <div className="meta-section">
        <h4>Έργο</h4>
        <label>Κωδικός έργου<input maxLength={50} {...text('kodikosErg')} /></label>
        <label>Κατηγορία έργου<ComboSelect options={lookups.kathgoriaErg} {...num('kathgId')} /></label>
        <label>Υποκατηγορία έργου<ComboSelect options={ypokat} {...num('ypokatId')} /></label>
        <label>Περιγραφή έργου<textarea rows={2} maxLength={2000} {...text('perigrafhErg')} /></label>
        <label>Μονάδα<ComboSelect options={lookups.monada} {...num('hstrId')} /></label>
        <label>Υπομονάδα<input maxLength={500} {...text('titlosErg')} /></label>
      </div>
      <div className="meta-section">
        <h4>Πρόσθετες πληροφορίες</h4>
        <label>Χώρος αποθήκευσης<ComboSelect options={lookups.xorosApoth} {...num('xorosId')} /></label>
        <label>Ημερομηνία
          <input type="date" value={form.hmer ?? ''}
            onChange={(e) => setForm({ ...form, hmer: e.target.value || null })} />
        </label>
      </div>
      <p>
        <button className="primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>{' '}
        <button type="button" onClick={onDone}>Ακύρωση</button>
      </p>
      {mutation.isError && <p className="status-err">{(mutation.error as Error).message}</p>}
    </form>
  )
}
