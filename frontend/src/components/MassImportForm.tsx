import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AbortedError, formatMb, importDrawing, pingSession, UnauthorizedError, type UploadProgress } from '../api/api'
import ComboSelect from './ComboSelect'
import { ProgressBar, Spinner } from './Loading'
import { monadaForEdit } from '../api/types'
import type { Lookup, LookupData } from '../api/types'

interface MassImportFormProps {
  lookups: LookupData
  onClose: () => void
}

/** Text/lookup fields shared by the common section and the per-file overrides (all strings; '' = unset). */
interface MetaFields {
  eidosId: string
  titlosSxed: string
  perigrafhSxed: string
  kodikosErg: string
  kathgId: string
  ypokatId: string
  perigrafhErg: string
  hstrId: string
  titlosErg: string
  xorosId: string
  hmer: string
}

const EMPTY_META: MetaFields = {
  eidosId: '', titlosSxed: '', perigrafhSxed: '', kodikosErg: '', kathgId: '', ypokatId: '',
  perigrafhErg: '', hstrId: '', titlosErg: '', xorosId: '', hmer: '',
}

type RowStatus =
  | { kind: 'pending' }
  | { kind: 'uploading'; progress: UploadProgress }
  | { kind: 'done'; id: number }
  | { kind: 'error'; message: string; aborted?: boolean }

interface FileRow {
  key: number
  file: File
  /** Per-file only (not inherited): defaults to the file name without extension. */
  arithmosSxed: string
  /** Per-file fine-tuning; '' = inherit the common value. */
  overrides: MetaFields
  expanded: boolean
  status: RowStatus
}

const ACCEPT = '.tif,.tiff,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp'
let nextKey = 1

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

function hasOverrides(o: MetaFields): boolean {
  return Object.values(o).some((v) => v !== '')
}

/** Effective metadata for one file: override wins, otherwise the common value. */
function effective(common: MetaFields, o: MetaFields): MetaFields {
  const out = { ...common }
  for (const k of Object.keys(o) as (keyof MetaFields)[]) if (o[k] !== '') out[k] = o[k]
  // An overridden category invalidates an inherited subcategory (it belongs to another parent).
  if (o.kathgId !== '' && o.ypokatId === '') out.ypokatId = ''
  return out
}

function lookupName(list: Lookup[], id: string): string {
  return list.find((l) => String(l.id) === id)?.name ?? ''
}

/**
 * Mass import: many files, one set of common properties, optional per-file
 * fine-tuning. Files are sent one at a time through the normal import endpoint
 * (one row each, MAZIKI_KATAXWRISI = 1), so a failure in one file never affects
 * the others and each gets its own progress / result.
 */
export default function MassImportForm({ lookups, onClose }: MassImportFormProps) {
  const [common, setCommon] = useState<MetaFields>(EMPTY_META)
  const [rows, setRows] = useState<FileRow[]>([])
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [showCommon, setShowCommon] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const stopRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // ---- file list ------------------------------------------------------------
  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    if (!incoming.length) return
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.file.name + '|' + r.file.size))
      const fresh = incoming
        .filter((f) => !seen.has(f.name + '|' + f.size)) // the same file picked twice is added once
        .map<FileRow>((f) => ({
          key: nextKey++, file: f, arithmosSxed: stripExt(f.name),
          overrides: { ...EMPTY_META }, expanded: false, status: { kind: 'pending' },
        }))
      return [...prev, ...fresh]
    })
  }

  function patchRow(key: number, patch: Partial<FileRow> | ((r: FileRow) => Partial<FileRow>)) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)))
  }
  function patchOverride(key: number, patch: Partial<MetaFields>) {
    patchRow(key, (r) => ({ overrides: { ...r.overrides, ...patch } }))
  }
  const removeRow = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key))
  const removeDone = () => setRows((prev) => prev.filter((r) => r.status.kind !== 'done'))

  // ---- upload loop ----------------------------------------------------------
  function buildFormData(row: FileRow): FormData {
    const m = effective(common, row.overrides)
    const fd = new FormData()
    fd.append('file', row.file, row.file.name)
    fd.append('arithmosSxed', row.arithmosSxed.trim())
    for (const k of Object.keys(m) as (keyof MetaFields)[]) fd.append(k, m[k])
    fd.append('maziki', '1')
    return fd
  }

  async function run() {
    const todo = rows.filter((r) => r.status.kind !== 'done')
    if (!todo.length) return
    setRunning(true)
    setRunError(null)
    stopRef.current = false
    let imported = 0
    try {
      for (const row of todo) {
        if (stopRef.current) break
        const ctrl = new AbortController()
        abortRef.current = ctrl
        patchRow(row.key, { status: { kind: 'uploading', progress: { loaded: 0, total: 0, saving: false } } })
        try {
          // Pre-flight before every file: catches an expired session before the
          // bytes go out and renews the sliding session during a long batch.
          await pingSession()
          const { id } = await importDrawing(
            buildFormData(row),
            (progress) => patchRow(row.key, { status: { kind: 'uploading', progress } }),
            ctrl.signal,
          )
          imported++
          patchRow(row.key, { status: { kind: 'done', id } })
        } catch (e) {
          if (e instanceof UnauthorizedError) throw e // session gone: stop the whole batch
          const aborted = e instanceof AbortedError
          patchRow(row.key, { status: { kind: 'error', message: (e as Error).message, aborted } })
          if (aborted) break
        }
      }
    } catch (e) {
      setRunError((e as Error).message)
      // Whatever was in flight when the session died shows as an error, not as stuck "sending".
      setRows((prev) => prev.map((r) => (r.status.kind === 'uploading'
        ? { ...r, status: { kind: 'error', message: (e as Error).message } } : r)))
    } finally {
      abortRef.current = null
      setRunning(false)
      if (imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['drawings'] })
        queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      }
    }
  }

  function stop() {
    stopRef.current = true
    abortRef.current?.abort()
  }

  // ---- derived --------------------------------------------------------------
  const pendingRows = rows.filter((r) => r.status.kind !== 'done')
  const doneCount = rows.length - pendingRows.length
  const errorCount = rows.filter((r) => r.status.kind === 'error').length
  const missingNumber = pendingRows.filter((r) => !r.arithmosSxed.trim()).length
  const totalBytes = rows.reduce((s, r) => s + r.file.size, 0)
  const sentBytes = rows.reduce((s, r) => {
    if (r.status.kind === 'done') return s + r.file.size
    if (r.status.kind === 'uploading' && r.status.progress.total > 0)
      return s + Math.min(r.file.size, r.file.size * (r.status.progress.loaded / r.status.progress.total))
    return s
  }, 0)
  const overallPct = totalBytes > 0 ? (sentBytes / totalBytes) * 100 : 0
  // "Διακόπηκε" only when the loop stopped before reaching some files (Διακοπή / session loss).
  const stoppedEarly = !running && rows.some((r) => r.status.kind === 'pending') && doneCount + errorCount > 0
  const canStart = !running && pendingRows.length > 0 && missingNumber === 0

  const close = () => { if (!running) onClose() }

  const ypokatFor = (kathgId: string) =>
    lookups.ypokatErg.filter((y) => !kathgId || y.parentId === Number(kathgId))

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className={'modal mass-modal' + (running ? ' is-busy' : '')} aria-busy={running}>
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
            <MetaFieldsEditor value={common} onChange={setCommon} lookups={lookups}
                              ypokatOptions={ypokatFor(common.kathgId)} disabled={running} />
          )}
        </div>

        {/* ---- files ---- */}
        <div className="mass-section">
          <div className="mass-files-head">
            <span className="mass-section-title">Αρχεία ({rows.length})</span>
            <span>
              <input ref={fileInputRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
                     onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
              <button type="button" disabled={running} onClick={() => fileInputRef.current?.click()}>+ Προσθήκη αρχείων</button>{' '}
              {doneCount > 0 && !running && (
                <button type="button" onClick={removeDone}>Απόκρυψη καταχωρισμένων</button>
              )}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="mass-drop" onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => { e.preventDefault(); if (!running) addFiles(e.dataTransfer.files) }}>
              Σύρετε αρχεία εδώ ή πατήστε «Προσθήκη αρχείων».
            </div>
          ) : (
            <div className="mass-table-wrap" onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => { e.preventDefault(); if (!running) addFiles(e.dataTransfer.files) }}>
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
                  {rows.map((r) => {
                    const locked = running || r.status.kind === 'done'
                    const eff = effective(common, r.overrides)
                    return (
                      <FileRowView key={r.key} row={r} locked={locked} running={running}
                        onToggle={() => patchRow(r.key, { expanded: !r.expanded })}
                        onNumber={(v) => patchRow(r.key, { arithmosSxed: v })}
                        onRemove={() => removeRow(r.key)}>
                        {r.expanded && (
                          <MetaFieldsEditor value={r.overrides} onChange={(o) => patchRow(r.key, { overrides: o })}
                                            lookups={lookups} ypokatOptions={ypokatFor(eff.kathgId)}
                                            placeholders={common} disabled={locked}
                                            onClear={hasOverrides(r.overrides) && !locked
                                              ? () => patchOverride(r.key, { ...EMPTY_META }) : undefined} />
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
        {(running || doneCount > 0) && rows.length > 0 && (
          <div className="upload-status" aria-live="polite">
            <div className="upload-line">
              <span>
                {running && <><Spinner size={13} />{' '}</>}
                {running ? 'Αποστολή…' : stoppedEarly ? 'Διακόπηκε.' : 'Ολοκληρώθηκε.'}{' '}
                Καταχωρίστηκαν {doneCount} από {rows.length}
                {errorCount > 0 && <span className="status-err"> · {errorCount} με σφάλμα</span>}
              </span>
              <span className="mono">{Math.round(overallPct)}% ({formatMb(sentBytes)} / {formatMb(totalBytes)})</span>
            </div>
            <ProgressBar percent={overallPct} />
          </div>
        )}

        <p className="mass-actions">
          {running ? (
            <button type="button" onClick={stop}>Διακοπή</button>
          ) : (
            <>
              <button className="primary" type="button" disabled={!canStart} onClick={run}>
                {errorCount > 0 && errorCount === pendingRows.length
                  ? `Επανάληψη (${pendingRows.length})`
                  : pendingRows.length === 0 ? 'Καταχώριση'
                  : `Καταχώριση ${pendingRows.length} ${pendingRows.length === 1 ? 'αρχείου' : 'αρχείων'}`}
              </button>{' '}
              <button type="button" onClick={close}>Κλείσιμο</button>
            </>
          )}{' '}
          {!running && missingNumber > 0 && (
            <span className="status-warn">Συμπληρώστε αριθμό σχεδίου σε {missingNumber} {missingNumber === 1 ? 'αρχείο' : 'αρχεία'}.</span>
          )}
          {runError && <span className="status-err">{runError}</span>}
        </p>
      </div>
    </div>
  )
}

// ---- pieces -------------------------------------------------------------------

function summarize(m: MetaFields, lookups: LookupData): string {
  const parts: string[] = []
  if (m.eidosId) parts.push(lookupName(lookups.eidosSxed, m.eidosId))
  if (m.kodikosErg) parts.push(m.kodikosErg)
  if (m.kathgId) parts.push(lookupName(lookups.kathgoriaErg, m.kathgId))
  if (m.ypokatId) parts.push(lookupName(lookups.ypokatErg, m.ypokatId))
  if (m.hstrId) parts.push(lookupName(lookups.monada, m.hstrId))
  if (m.titlosErg) parts.push(m.titlosErg)
  if (m.titlosSxed) parts.push(m.titlosSxed)
  if (m.xorosId) parts.push(lookupName(lookups.xorosApoth, m.xorosId))
  if (m.hmer) parts.push(m.hmer)
  return parts.join(' · ')
}

function FileRowView({ row, locked, running, onToggle, onNumber, onRemove, children }: {
  row: FileRow
  locked: boolean
  running: boolean
  onToggle: () => void
  onNumber: (v: string) => void
  onRemove: () => void
  children?: React.ReactNode
}) {
  const tuned = hasOverrides(row.overrides)
  return (
    <>
      <tr className={'mass-row' + (row.expanded ? ' is-open' : '') + ' is-' + row.status.kind}>
        <td>
          <button type="button" className="mass-expand" onClick={onToggle} aria-expanded={row.expanded}
                  title={row.expanded ? 'Απόκρυψη ρυθμίσεων αρχείου' : 'Ρυθμίσεις ανά αρχείο'}>
            {row.expanded ? '▾' : '▸'}
          </button>
        </td>
        <td className="mass-name" title={row.file.name}>
          {row.file.name}
          {tuned && <span className="mass-tuned" title="Έχει διαφοροποιημένα στοιχεία">✎</span>}
        </td>
        <td className="mono">{formatMb(row.file.size)}</td>
        <td>
          <input value={row.arithmosSxed} maxLength={50} disabled={locked}
                 className={!row.arithmosSxed.trim() ? 'is-invalid' : undefined}
                 onChange={(e) => onNumber(e.target.value)} />
        </td>
        <td><RowStatusView status={row.status} /></td>
        <td>
          {!running && row.status.kind !== 'done' && (
            <button type="button" className="mass-remove" onClick={onRemove} title="Αφαίρεση">×</button>
          )}
        </td>
      </tr>
      {row.expanded && (
        <tr className="mass-detail">
          <td />
          <td colSpan={5}>{children}</td>
        </tr>
      )}
    </>
  )
}

function RowStatusView({ status }: { status: RowStatus }) {
  switch (status.kind) {
    case 'pending':
      return <span className="mass-status-pending">Σε αναμονή</span>
    case 'uploading': {
      const p = status.progress
      const pct = p.total > 0 ? (p.loaded / p.total) * 100 : 0
      return (
        <span className="mass-status-upl">
          <span className="upload-line">
            <span><Spinner size={11} /> {p.saving ? 'Αποθήκευση…' : p.total > 0 ? 'Αποστολή…' : 'Έναρξη…'}</span>
            {!p.saving && p.total > 0 && <span className="mono">{Math.round(pct)}%</span>}
          </span>
          <ProgressBar percent={pct} indeterminate={p.saving} />
        </span>
      )
    }
    case 'done':
      return <span className="status-ok">✓ Α/Α {status.id}</span>
    case 'error':
      return <span className={status.aborted ? 'status-warn' : 'status-err'} title={status.message}>{status.message}</span>
  }
}

/**
 * The metadata grid (everything except Αριθμός σχεδίου, which is per file).
 * With `placeholders` it edits per-file overrides: blank text fields show the
 * common value greyed out, lookup pickers offer «↑ <common value>» as the blank
 * entry. Blank = inherit.
 */
function MetaFieldsEditor({ value, onChange, lookups, ypokatOptions, placeholders, disabled, onClear }: {
  value: MetaFields
  onChange: (m: MetaFields) => void
  lookups: LookupData
  ypokatOptions: Lookup[]
  placeholders?: MetaFields
  disabled?: boolean
  onClear?: () => void
}) {
  const set = (patch: Partial<MetaFields>) => onChange({ ...value, ...patch })
  const ph = (k: keyof MetaFields) => placeholders?.[k] ?? ''
  const inherit = (list: Lookup[], k: keyof MetaFields) =>
    placeholders ? '↑ ' + (lookupName(list, ph(k)) || '—') : '—'
  return (
    <div className={'mass-fields' + (disabled ? ' is-disabled' : '')}>
      <table className="form-table mass-form-table">
        <tbody>
          <tr><th className="section-row" colSpan={4}>Σχέδιο</th></tr>
          <tr>
            <th>Είδος σχεδίου</th>
            <td>
              <ComboSelect options={lookups.eidosSxed} value={value.eidosId} allLabel={inherit(lookups.eidosSxed, 'eidosId')}
                           onChange={(id) => set({ eidosId: id })} />
            </td>
            <th>Ημερομηνία</th>
            <td>
              <input type="date" value={value.hmer} onChange={(e) => set({ hmer: e.target.value })}
                     title={placeholders && ph('hmer') && !value.hmer ? 'Κοινή τιμή: ' + ph('hmer') : undefined} />
            </td>
          </tr>
          <tr>
            <th>Τίτλος σχεδίου</th>
            <td colSpan={3}>
              <input maxLength={500} value={value.titlosSxed} placeholder={ph('titlosSxed')}
                     onChange={(e) => set({ titlosSxed: e.target.value })} />
            </td>
          </tr>
          <tr>
            <th>Περιγραφή σχεδίου</th>
            <td colSpan={3}>
              <textarea maxLength={2000} rows={2} value={value.perigrafhSxed} placeholder={ph('perigrafhSxed')}
                        onChange={(e) => set({ perigrafhSxed: e.target.value })} />
            </td>
          </tr>

          <tr><th className="section-row" colSpan={4}>Έργο</th></tr>
          <tr>
            <th>Κωδικός έργου</th>
            <td>
              <input maxLength={50} value={value.kodikosErg} placeholder={ph('kodikosErg')}
                     onChange={(e) => set({ kodikosErg: e.target.value })} />
            </td>
            <th>Κατηγορία έργου</th>
            <td>
              <ComboSelect options={lookups.kathgoriaErg} value={value.kathgId} allLabel={inherit(lookups.kathgoriaErg, 'kathgId')}
                           onChange={(id) => set({ kathgId: id, ypokatId: '' })} />
            </td>
          </tr>
          <tr>
            <th>Υποκατηγορία έργου</th>
            <td>
              <ComboSelect options={ypokatOptions} value={value.ypokatId}
                           // an inherited subcategory only applies if the category is also inherited
                           allLabel={placeholders && (value.kathgId === '' || !ph('kathgId'))
                             ? inherit(lookups.ypokatErg, 'ypokatId') : '—'}
                           onChange={(id) => set({ ypokatId: id })} />
            </td>
            <th>Περιγραφή έργου</th>
            <td>
              <textarea maxLength={2000} rows={2} value={value.perigrafhErg} placeholder={ph('perigrafhErg')}
                        onChange={(e) => set({ perigrafhErg: e.target.value })} />
            </td>
          </tr>
          <tr>
            <th>Μονάδα</th>
            <td>
              <ComboSelect options={monadaForEdit(lookups)} value={value.hstrId} allLabel={inherit(lookups.monada, 'hstrId')}
                           onChange={(id) => set({ hstrId: id })} />
            </td>
            <th>Υπομονάδα</th>
            <td>
              <input maxLength={500} value={value.titlosErg} placeholder={ph('titlosErg')}
                     onChange={(e) => set({ titlosErg: e.target.value })} />
            </td>
          </tr>

          <tr><th className="section-row" colSpan={4}>Πρόσθετες πληροφορίες</th></tr>
          <tr>
            <th>Χώρος αποθήκευσης</th>
            <td>
              <ComboSelect options={lookups.xorosApoth} value={value.xorosId} allLabel={inherit(lookups.xorosApoth, 'xorosId')}
                           onChange={(id) => set({ xorosId: id })} />
            </td>
            <td colSpan={2} className="mass-fields-foot">
              {placeholders && (
                <span className="mass-inherit-note">
                  Κενό πεδίο = κοινή τιμή.
                  {onClear && <> <button type="button" className="linklike" onClick={onClear}>Επαναφορά στα κοινά</button></>}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
