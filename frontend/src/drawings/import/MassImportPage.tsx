import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { hasRight, type UserInfo } from '../../api/auth'
import { getLookups } from '../../api/lookups'
import { formatMb } from '../../lib/format'
import { LoadingBlock, ProgressBar, Spinner } from '../../components/Loading'
import ConfirmModal from '../../components/ConfirmModal'
import { showToast } from '../../components/toasts'
import { useLeaveGuard } from '../../components/useLeaveGuard'
import { ForbiddenPage } from '../../pages/StatusPage'
import { EMPTY_META, type MetaValues } from '../meta/fields'
import { useAppConfig } from '../../components/useAppConfig'
import { ACCEPT_FALLBACK } from './accept'
import FileRowView from './FileRow'
import MassMetaEditor, { summarize } from './MassMetaEditor'
import { effective, hasOverrides, useUploadQueue } from './useUploadQueue'

/**
 * «Μαζική καταχώριση» — a full page: many files, one set of common properties,
 * optional per-file fine-tuning. This component is the screen; the file list
 * and the upload loop live in useUploadQueue, the fields in MassMetaEditor.
 * When a run ends with every file imported it returns to the list.
 */
export default function MassImportPage() {
  const user = useOutletContext<UserInfo>()
  const accept = useAppConfig()?.accept ?? ACCEPT_FALLBACK
  const navigate = useNavigate()
  const location = useLocation()
  // The list passes its query string, so returning lands on the same filtered page.
  const from = (location.state as { from?: string } | null)?.from ?? ''

  const [common, setCommon] = useState<MetaValues>(EMPTY_META)
  const [showCommon, setShowCommon] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const leavingRef = useRef(false) // set right before the intentional post-run navigate
  const q = useUploadQueue(common)

  const lookupsQuery = useQuery({ queryKey: ['lookups'], queryFn: ({ signal }) => getLookups(signal), staleTime: Infinity })
  const lookups = lookupsQuery.data

  // Unsaved work: a run in progress, files not yet imported, or common values
  // typed before any file was added. All files done => leaving loses nothing.
  const blocker = useLeaveGuard(() => !leavingRef.current && (
    q.running || q.pendingRows.length > 0 ||
    (q.rows.length === 0 && Object.values(common).some((v) => v !== ''))
  ))

  // When a run ends with every file imported, go back to the list; with errors
  // (or after Διακοπή) stay here so the remaining rows can be fixed and retried.
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !q.running && q.rows.length > 0 && q.doneCount === q.rows.length) {
      leavingRef.current = true
      showToast(q.doneCount === 1 ? 'Καταχωρήθηκε 1 σχέδιο.' : `Καταχωρήθηκαν ${q.doneCount} σχέδια.`)
      navigate('/drawings' + from)
    }
    wasRunning.current = q.running
  })

  const dropFiles = (e: React.DragEvent) => {
    e.preventDefault()
    if (!q.running) q.addFiles(e.dataTransfer.files)
  }

  if (!hasRight(user, 'SCAN'))
    return <ForbiddenPage message="Η καταχώριση σχεδίων απαιτεί το δικαίωμα «Καταχώριση & μαζική καταχώριση»." />

  if (!lookups) {
    return (
      <>
        <h2 className="page-title">Μαζική καταχώριση σχεδίων</h2>
        {lookupsQuery.isError
          ? <p className="status-err">Σφάλμα: {(lookupsQuery.error as Error).message}</p>
          : <LoadingBlock text="Φόρτωση…" />}
      </>
    )
  }

  return (
    <div className="import-page">
      <h2 className="page-title">Μαζική καταχώριση σχεδίων</h2>
      <section className={'card mass-card' + (q.running ? ' is-busy' : '')} aria-busy={q.running}>
        {/* ---- common properties ---- */}
        <div className="mass-section">
          <button type="button" className="mass-section-toggle" onClick={() => setShowCommon((v) => !v)}
                  aria-expanded={showCommon}>
            <span className="mass-caret">{showCommon ? '▾' : '▸'}</span> Κοινά στοιχεία
            {!showCommon && <span className="mass-summary"> — {summarize(common, lookups) || 'κανένα'}</span>}
          </button>
          {showCommon && (
            <MassMetaEditor values={common} onChange={setCommon} lookups={lookups} disabled={q.running} />
          )}
        </div>

        {/* ---- files ---- */}
        <div className="mass-section">
          <div className="mass-files-head">
            <span className="mass-section-title">Αρχεία ({q.rows.length})</span>
            <span>
              <input ref={fileInputRef} type="file" multiple accept={accept} style={{ display: 'none' }}
                     onChange={(e) => { if (e.target.files) q.addFiles(e.target.files); e.target.value = '' }} />
              <button type="button" disabled={q.running} onClick={() => fileInputRef.current?.click()}>+ Προσθήκη αρχείων</button>{' '}
              {q.doneCount > 0 && !q.running && (
                <button type="button" onClick={q.removeDone}>Απόκρυψη καταχωρημένων</button>
              )}
            </span>
          </div>

          {q.rows.length === 0 ? (
            <div className="mass-drop" onDragOver={(e) => e.preventDefault()} onDrop={dropFiles}>
              Σύρετε αρχεία εδώ ή πατήστε «Προσθήκη αρχείων».
            </div>
          ) : (
            <div className="mass-table-wrap" onDragOver={(e) => e.preventDefault()} onDrop={dropFiles}>
              <table className="mass-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Αρχείο</th>
                    <th style={{ width: 90 }}>Μέγεθος</th>
                    <th style={{ width: 190 }}>Αριθμός σχεδίου *</th>
                    <th style={{ width: 220 }}>Κατάσταση</th>
                    <th style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {q.rows.map((r) => {
                    const locked = q.running || r.status.kind === 'done'
                    return (
                      <FileRowView key={r.key} row={r} locked={locked} running={q.running}
                        onToggle={() => q.patchRow(r.key, { expanded: !r.expanded })}
                        onNumber={(v) => q.patchRow(r.key, { arithmosSxed: v })}
                        onRemove={() => q.removeRow(r.key)}>
                        {r.expanded && (
                          <MassMetaEditor values={r.overrides} onChange={(o) => q.patchRow(r.key, { overrides: o })}
                                          lookups={lookups} placeholders={common}
                                          optionsBasis={effective(common, r.overrides)} disabled={locked}
                                          onClear={hasOverrides(r.overrides) && !locked
                                            ? () => q.patchOverride(r.key, { ...EMPTY_META }) : undefined} />
                        )}
                      </FileRowView>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---- overall progress / actions ---- */}
        {(q.running || q.doneCount > 0) && q.rows.length > 0 && (
          <div className="upload-status" aria-live="polite">
            <div className="upload-line">
              <span>
                {q.running && <><Spinner size={13} />{' '}</>}
                {q.running ? 'Αποστολή…' : q.stoppedEarly ? 'Διακόπηκε.' : 'Ολοκληρώθηκε.'}{' '}
                Καταχωρήθηκαν {q.doneCount} από {q.rows.length}
                {q.errorCount > 0 && <span className="status-err"> · {q.errorCount} με σφάλμα</span>}
              </span>
              <span className="mono">{Math.round(q.overallPct)}% ({formatMb(q.sentBytes)} / {formatMb(q.totalBytes)})</span>
            </div>
            <ProgressBar percent={q.overallPct} />
          </div>
        )}

        <p className="mass-actions">
          {q.running ? (
            <button type="button" onClick={q.stop}>Διακοπή</button>
          ) : (
            <>
              <button className="primary" type="button" disabled={!q.canStart} onClick={q.run}>
                {q.errorCount > 0 && q.errorCount === q.pendingRows.length
                  ? `Επανάληψη (${q.pendingRows.length})`
                  : q.pendingRows.length === 0 ? 'Καταχώριση'
                  : `Καταχώριση ${q.pendingRows.length} ${q.pendingRows.length === 1 ? 'αρχείου' : 'αρχείων'}`}
              </button>{' '}
              <button type="button" onClick={() => navigate('/drawings' + from)}>Επιστροφή στη λίστα</button>
            </>
          )}{' '}
          {!q.running && q.missingNumber > 0 && (
            <span className="status-warn">Συμπληρώστε αριθμό σχεδίου σε {q.missingNumber} {q.missingNumber === 1 ? 'αρχείο' : 'αρχεία'}.</span>
          )}
          {q.runError && <span className="status-err">{q.runError}</span>}
        </p>
      </section>
      {blocker.state === 'blocked' && (
        <ConfirmModal
          title="Αποχώρηση από τη μαζική καταχώριση;"
          message={q.running
            ? 'Η αποστολή θα διακοπεί· όσα αρχεία έχουν ήδη ολοκληρωθεί παραμένουν καταχωρημένα.'
            : 'Τα αρχεία που δεν έχουν καταχωρηθεί και τα στοιχεία που έχετε συμπληρώσει θα χαθούν.'}
          confirmLabel="Αποχώρηση"
          onConfirm={() => { q.stop(); blocker.proceed() }}
          onCancel={() => blocker.reset()}
        />
      )}
    </div>
  )
}
