import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pingSession } from '../../api/auth'
import { importDrawing, type UploadProgress } from '../../api/drawings'
import { AbortedError } from '../../api/http'
import { formatMb } from '../../lib/format'
import { ProgressBar, Spinner } from '../../components/Loading'
import Modal from '../../components/Modal'
import type { LookupData } from '../../api/types'
import { appendMeta, EMPTY_META, type MetaValues } from '../meta/fields'
import { MetaCells, MetaForm } from '../meta/MetaForm'
import { ACCEPT } from './accept'

interface ImportFormProps {
  lookups: LookupData
  onClose: () => void
}

/** «Καταχώριση σχεδίου»: one file plus its metadata. The fields come from
    META_FIELDS — this screen only decides where they sit in the table. */
export default function ImportForm({ lookups, onClose }: ImportFormProps) {
  const [values, setValues] = useState<MetaValues>(EMPTY_META)
  const [lastId, setLastId] = useState<number | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (fd: FormData) => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setProgress({ loaded: 0, total: 0, saving: false })
      // Pre-flight: if the session has expired, find out now (401 -> login) rather
      // than after uploading a 200 MB scan. Also renews a sliding session.
      await pingSession()
      return importDrawing(fd, setProgress, ctrl.signal)
    },
    onSettled: () => { abortRef.current = null; setProgress(null) },
    onSuccess: ({ id }) => {
      setLastId(id)
      // New drawing must appear in any search page.
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
    },
  })

  // Dropped file goes into the real <input type=file>, so the browser's `required`
  // check still guards the submit.
  function dropFile(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (busy || !fileRef.current) return
    const f = e.dataTransfer.files[0]
    if (!f) return
    const dt = new DataTransfer()
    dt.items.add(f)
    fileRef.current.files = dt.files
    setFileName(f.name); setFileSize(f.size)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const file = fileRef.current?.files?.[0]
    if (!file) return // the input is `required`; the browser stops us before this
    const fd = new FormData()
    fd.append('file', file, file.name)
    appendMeta(fd, values)
    mutation.mutate(fd, {
      onSuccess: () => {
        form.reset() // clears the file input
        setValues(EMPTY_META)
        setFileName(''); setFileSize(null)
      },
    })
  }

  const busy = mutation.isPending
  const pct = progress && progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0

  return (
    // Deliberately not dismissable: a click outside or an Escape would throw away
    // a filled-in form, and while sending it would also hide the outcome of an
    // upload the server is still writing. «Κλείσιμο» below is the way out.
    <Modal className={busy ? 'is-busy' : undefined} busy={busy}>
      <h3>Καταχώριση νέου σχεδίου</h3>
      <form onSubmit={submit}>
        <MetaForm values={values} onChange={setValues} lookups={lookups}>
          <table className="form-table">
            <tbody>
              <tr><th className="section-row" colSpan={4}>Σχέδιο</th></tr>
              <tr>
                <MetaCells k="arithmosSxed" required />
                <MetaCells k="eidosId" />
              </tr>
              <tr><MetaCells k="titlosSxed" wide /></tr>
              <tr><MetaCells k="perigrafhSxed" wide /></tr>

              <tr><th className="section-row" colSpan={4}>Έργο</th></tr>
              <tr>
                <MetaCells k="kodikosErg" />
                <MetaCells k="kathgId" />
              </tr>
              <tr>
                <MetaCells k="ypokatId" />
                <MetaCells k="perigrafhErg" />
              </tr>
              <tr>
                <MetaCells k="hstrId" />
                <MetaCells k="titlosErg" />
              </tr>

              <tr><th className="section-row" colSpan={4}>Πρόσθετες πληροφορίες</th></tr>
              <tr>
                <MetaCells k="xorosId" />
                <MetaCells k="hmer" />
              </tr>
              <tr>
                <th>Αρχείο *</th>
                <td colSpan={3}>
                  <div className={'drop-zone' + (dragOver ? ' is-over' : '') + (fileName ? ' has-file' : '')}
                       onClick={() => !busy && fileRef.current?.click()}
                       onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true) }}
                       onDragLeave={() => setDragOver(false)}
                       onDrop={dropFile}>
                    {/* kept in the layout (not display:none) so the browser's `required` bubble can anchor to it */}
                    <input ref={fileRef} name="file" type="file" className="drop-zone-input"
                           accept={ACCEPT} required
                           onChange={(e) => {
                             const f = e.target.files?.[0]
                             setFileName(f?.name ?? ''); setFileSize(f?.size ?? null)
                           }} />
                    {fileName
                      ? <span className="drop-zone-file">{fileName}{fileSize != null && <> — {formatMb(fileSize)}</>}</span>
                      : <span>Σύρετε το αρχείο εδώ ή πατήστε για επιλογή.</span>}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </MetaForm>
        {busy && progress && (
          <div className="upload-status" aria-live="polite">
            <div className="upload-line">
              <span>
                <Spinner size={13} />{' '}
                {progress.saving
                  ? 'Αποθήκευση στη βάση δεδομένων…'
                  : progress.total > 0 ? 'Αποστολή αρχείου…' : 'Έναρξη αποστολής…'}
              </span>
              {!progress.saving && progress.total > 0 && (
                <span className="mono">
                  {Math.round(pct)}% ({formatMb(progress.loaded)} / {formatMb(progress.total)})
                </span>
              )}
            </div>
            <ProgressBar percent={pct} indeterminate={progress.saving} />
          </div>
        )}
        <p>
          <button className={'primary' + (busy ? ' btn-busy' : '')} type="submit" disabled={busy}>
            {busy && <Spinner size={13} />}
            {busy ? 'Αποστολή…' : 'Καταχώριση'}
          </button>{' '}
          {busy
            ? <button type="button" onClick={() => abortRef.current?.abort()}>Ακύρωση</button>
            : <button type="button" onClick={onClose}>Κλείσιμο</button>}{' '}
          {mutation.isError && (
            <span className={mutation.error instanceof AbortedError ? 'status-warn' : 'status-err'}>
              {(mutation.error as Error).message}
            </span>
          )}
          {mutation.isSuccess && lastId != null && (
            <span className="status-ok">Καταχωρίστηκε με Α/Α {lastId}.</span>
          )}
        </p>
      </form>
    </Modal>
  )
}
