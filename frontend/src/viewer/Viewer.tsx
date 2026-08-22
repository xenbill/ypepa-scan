import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router'
import OpenSeadragon from 'openseadragon'
import { hasRight, type UserInfo } from '../api/auth'
import { deleteDrawing, downloadFile, getDrawing, getViewInfo } from '../api/drawings'
import { NotFoundError, UnauthorizedError } from '../api/http'
import { getLookups } from '../api/lookups'
import { formatDate, formatFileType, formatMb } from '../lib/format'
import { SkeletonLines, Spinner } from '../components/Loading'
import { StatusPage } from '../pages/StatusPage'
import ConfirmModal from '../components/ConfirmModal'
import { anyModalOpen } from '../components/Modal'
import { showToast } from '../components/toasts'
import MetaEditForm from './MetaEditForm'

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
  // Rights: PRINT → Λήψη πρωτοτύπου, EDIT_SCANNED_SXEDIO → Επεξεργασία / Διαγραφή
  // (the server enforces them too; here we just don't show what the user can't do).
  const user = useOutletContext<UserInfo>()
  const canPrint = hasRight(user, 'PRINT')
  const canEdit = hasRight(user, 'EDIT_SCANNED_SXEDIO')

  // Download: fetches the whole file before the browser's save dialog appears, so
  // the button must show it's working (and refuse a second click meanwhile).
  const download = useMutation({ mutationFn: () => downloadFile(id) })

  const deleteMutation = useMutation({
    mutationFn: () => deleteDrawing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      queryClient.removeQueries({ queryKey: ['drawing', id] })
      showToast('Το σχέδιο διαγράφηκε.')
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
    // Escape closes the viewer — unless the metadata form is open (unsaved edits)
    // or a dialog is in front of it, which takes the key for itself.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !anyModalOpen()) onClose() }
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
          {/* No canvas to act on when the file cannot be previewed (unsupported
              type, or a CAD file while the CAD feature is off) — only the
              download of the original still makes sense. */}
          {!viewQuery.isError && info?.type !== 'pdf' && (
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
          {canPrint && (
            <button className={download.isPending ? 'btn-busy' : undefined} disabled={download.isPending}
                    onClick={() => download.mutate()}>
              {download.isPending && <Spinner size={13} />}
              {download.isPending ? 'Λήψη…' : 'Λήψη πρωτοτύπου'}
            </button>
          )}
          {canEdit && <button className="danger" onClick={() => setConfirmDelete(true)}>Διαγραφή</button>}
          <button onClick={onClose}>Κλείσιμο</button>
        </span>
      </div>
      <div className="viewer-body">
        {viewQuery.isError && (
          <div className="viewer-message">
            <strong>Δεν είναι δυνατή η προβολή του αρχείου</strong>
            {(viewQuery.error as Error).message}
            {canPrint
              ? <span>Μπορείτε να κατεβάσετε το πρωτότυπο («Λήψη πρωτοτύπου») και να το ανοίξετε
                  με το κατάλληλο πρόγραμμα στον υπολογιστή σας.</span>
              : <span>Το πρωτότυπο αρχείο παραμένει αποθηκευμένο στο αρχείο.</span>}
          </div>
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
          // Without PRINT, ask the browser's PDF viewer to hide its toolbar (download/print
          // buttons). Chrome/Edge honour #toolbar=0; Firefox ignores it. UI only — the
          // server-side PRINT check covers the actual download endpoint.
          ? <iframe className="viewer-canvas" title="PDF" src={info.url + (canPrint ? '' : '#toolbar=0')} />
          : <div className="viewer-canvas" ref={osdRef} style={{ visibility: info ? 'visible' : 'hidden' }} />}
        <div className="viewer-meta">
          <div className="meta-head">
            <h3>Στοιχεία σχεδίου</h3>
            {canEdit && !editing && drawing && (
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
