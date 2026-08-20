import { useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hasRight, pingSession, type UserInfo } from '../../api/auth'
import { importDrawing, type UploadProgress } from '../../api/drawings'
import { AbortedError } from '../../api/http'
import { getLookups } from '../../api/lookups'
import { formatMb } from '../../lib/format'
import { LoadingBlock, ProgressBar, Spinner } from '../../components/Loading'
import ConfirmModal from '../../components/ConfirmModal'
import { showToast } from '../../components/toasts'
import { useLeaveGuard } from '../../components/useLeaveGuard'
import { ForbiddenPage } from '../../pages/StatusPage'
import { appendMeta, EMPTY_META, type MetaValues } from '../meta/fields'
import { MetaCells, MetaForm } from '../meta/MetaForm'
import { ACCEPT } from './accept'

/** «Καταχώριση σχεδίου» — a full page: one file plus its metadata. The fields
    come from META_FIELDS — this screen only decides where they sit in the
    table. On success it returns to the list, which announces the new Α/Α. */
export default function ImportPage() {
  const user = useOutletContext<UserInfo>()
  const navigate = useNavigate()
  const location = useLocation()
  // The list passes its query string, so returning lands on the same filtered page.
  const from = (location.state as { from?: string } | null)?.from ?? ''

  const [values, setValues] = useState<MetaValues>(EMPTY_META)
  const [fieldErrors, setFieldErrors] = useState<{ arithmos?: string; file?: string }>({})
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const leavingRef = useRef(false) // set right before the intentional post-success navigate
  const queryClient = useQueryClient()

  const lookupsQuery = useQuery({ queryKey: ['lookups'], queryFn: ({ signal }) => getLookups(signal), staleTime: Infinity })
  const lookups = lookupsQuery.data

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
    onSuccess: () => {
      // New drawing must appear in any search page.
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      leavingRef.current = true
      showToast('Το σχέδιο καταχωρήθηκε.')
      navigate('/drawings' + from)
    },
  })

  const busy = mutation.isPending
  const dirty = fileName !== '' || Object.values(values).some((v) => v !== '')
  const blocker = useLeaveGuard(() => !leavingRef.current && (busy || dirty))

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
    setFieldErrors((fe) => ({ ...fe, file: undefined }))
  }

  // Validated here (not by the browser) so the message shows inline at the
  // field, styled like the rest of the app — hence noValidate on the form.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    const errors = {
      arithmos: values.arithmosSxed.trim() === '' ? 'Συμπληρώστε τον αριθμό σχεδίου.' : undefined,
      file: !file ? 'Επιλέξτε το αρχείο του σχεδίου.' : undefined,
    }
    setFieldErrors(errors)
    if (errors.arithmos || errors.file || !file) return
    const fd = new FormData()
    fd.append('file', file, file.name)
    appendMeta(fd, values)
    mutation.mutate(fd)
  }

  if (!hasRight(user, 'SCAN'))
    return <ForbiddenPage message="Η καταχώριση σχεδίων απαιτεί το δικαίωμα «Καταχώριση & μαζική καταχώριση»." />

  if (!lookups) {
    return (
      <>
        <h2 className="page-title">Καταχώριση νέου σχεδίου</h2>
        {lookupsQuery.isError
          ? <p className="status-err">Σφάλμα: {(lookupsQuery.error as Error).message}</p>
          : <LoadingBlock text="Φόρτωση…" />}
      </>
    )
  }

  const pct = progress && progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0

  return (
    <div className="import-page">
      <h2 className="page-title">Καταχώριση νέου σχεδίου</h2>
      <section className={'card import-card' + (busy ? ' is-busy' : '')} aria-busy={busy}>
        <form onSubmit={submit} noValidate>
          <MetaForm values={values} lookups={lookups}
                    onChange={(v) => {
                      setValues(v)
                      if (v.arithmosSxed.trim()) setFieldErrors((fe) => ({ ...fe, arithmos: undefined }))
                    }}>
            <table className="form-table">
              <tbody>
                <tr><th className="section-row" colSpan={4}>Σχέδιο</th></tr>
                <tr>
                  <MetaCells k="arithmosSxed" required error={fieldErrors.arithmos} />
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
                    <div className={'drop-zone' + (dragOver ? ' is-over' : '') + (fileName ? ' has-file' : '')
                                    + (fieldErrors.file ? ' is-invalid' : '')}
                         onClick={() => !busy && fileRef.current?.click()}
                         onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true) }}
                         onDragLeave={() => setDragOver(false)}
                         onDrop={dropFile}>
                      <input ref={fileRef} name="file" type="file" className="drop-zone-input"
                             accept={ACCEPT}
                             onChange={(e) => {
                               const f = e.target.files?.[0]
                               setFileName(f?.name ?? ''); setFileSize(f?.size ?? null)
                               if (f) setFieldErrors((fe) => ({ ...fe, file: undefined }))
                             }} />
                      {fileName
                        ? <span className="drop-zone-file">{fileName}{fileSize != null && <> — {formatMb(fileSize)}</>}</span>
                        : <span>Σύρετε το αρχείο εδώ ή πατήστε για επιλογή.</span>}
                    </div>
                    {fieldErrors.file && <div className="field-err">{fieldErrors.file}</div>}
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
              : <button type="button" onClick={() => navigate('/drawings' + from)}>Επιστροφή στη λίστα</button>}{' '}
            {mutation.isError && (
              <span className={mutation.error instanceof AbortedError ? 'status-warn' : 'status-err'}>
                {(mutation.error as Error).message}
              </span>
            )}
          </p>
        </form>
      </section>
      {blocker.state === 'blocked' && (
        <ConfirmModal
          title="Αποχώρηση από την καταχώριση;"
          message={busy
            ? 'Η αποστολή του αρχείου θα ακυρωθεί και το σχέδιο δεν θα καταχωρηθεί.'
            : 'Τα στοιχεία που έχετε συμπληρώσει θα χαθούν.'}
          confirmLabel="Αποχώρηση"
          onConfirm={() => { abortRef.current?.abort(); blocker.proceed() }}
          onCancel={() => blocker.reset()}
        />
      )}
    </div>
  )
}
