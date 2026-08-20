import { useRef, useState } from 'react'
import { formatMb } from '../../lib/format'
import { ProgressBar, Spinner } from '../../components/Loading'
import Modal from '../../components/Modal'
import type { LookupData } from '../../api/types'
import { EMPTY_META, type MetaValues } from '../meta/fields'
import { ACCEPT } from './accept'
import FileRowView from './FileRow'
import MassMetaEditor, { summarize } from './MassMetaEditor'
import { effective, hasOverrides, useUploadQueue } from './useUploadQueue'

interface MassImportFormProps {
  lookups: LookupData
  onClose: () => void
}

/**
 * «Μαζική καταχώριση»: many files, one set of common properties, optional
 * per-file fine-tuning. This component is the dialog; the file list and the
 * upload loop live in useUploadQueue, the fields in MassMetaEditor.
 */
export default function MassImportForm({ lookups, onClose }: MassImportFormProps) {
  const [common, setCommon] = useState<MetaValues>(EMPTY_META)
  const [showCommon, setShowCommon] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const q = useUploadQueue(common)

  const dropFiles = (e: React.DragEvent) => {
    e.preventDefault()
    if (!q.running) q.addFiles(e.dataTransfer.files)
  }

  return (
    // Not dismissable — same reason as ImportForm: the file list and the common
    // values are real work. «Διακοπή» / «Κλείσιμο» below are the ways out.
    <Modal className={'mass-modal' + (q.running ? ' is-busy' : '')} busy={q.running}>
      <h3>Μαζική καταχώριση σχεδίων</h3>
      <p className="mass-help">
        Επιλέξτε πολλά αρχεία, συμπληρώστε μία φορά τα κοινά στοιχεία και, όπου χρειάζεται,
        διαφοροποιήστε ανά αρχείο. Κάθε αρχείο καταχωρίζεται ως ξεχωριστό σχέδιο.
      </p>

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
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
                   onChange={(e) => { if (e.target.files) q.addFiles(e.target.files); e.target.value = '' }} />
            <button type="button" disabled={q.running} onClick={() => fileInputRef.current?.click()}>+ Προσθήκη αρχείων</button>{' '}
            {q.doneCount > 0 && !q.running && (
              <button type="button" onClick={q.removeDone}>Απόκρυψη καταχωρισμένων</button>
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
              Καταχωρίστηκαν {q.doneCount} από {q.rows.length}
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
            <button type="button" onClick={onClose}>Κλείσιμο</button>
          </>
        )}{' '}
        {!q.running && q.missingNumber > 0 && (
          <span className="status-warn">Συμπληρώστε αριθμό σχεδίου σε {q.missingNumber} {q.missingNumber === 1 ? 'αρχείο' : 'αρχεία'}.</span>
        )}
        {q.runError && <span className="status-err">{q.runError}</span>}
      </p>
    </Modal>
  )
}
