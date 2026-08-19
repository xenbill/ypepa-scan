import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AbortedError, formatMb, importDrawing, pingSession, type UploadProgress } from '../api/api'
import ComboSelect from './ComboSelect'
import { ProgressBar, Spinner } from './Loading'
import type { LookupData } from '../api/types'

interface ImportFormProps {
  lookups: LookupData
  onClose: () => void
}

export default function ImportForm({ lookups, onClose }: ImportFormProps) {
  // Lookup pickers are ComboSelect (not native form controls), so their values
  // reach the FormData through paired hidden inputs.
  const [eidosId, setEidosId] = useState('')
  const [kathgId, setKathgId] = useState('')
  const [ypokatId, setYpokatId] = useState('')
  const [hstrId, setHstrId] = useState('')
  const [xorosId, setXorosId] = useState('')
  const [lastId, setLastId] = useState<number | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)
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

  function resetLookups() {
    setEidosId(''); setKathgId(''); setYpokatId(''); setHstrId(''); setXorosId('')
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    mutation.mutate(new FormData(form), {
      onSuccess: () => {
        form.reset()
        resetLookups()
      },
    })
  }

  const ypokat = lookups.ypokatErg.filter((y) => !kathgId || y.parentId === Number(kathgId))
  const busy = mutation.isPending
  const pct = progress && progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0
  // Backdrop click / Κλείσιμο are ignored while sending: closing would hide the
  // outcome while the server keeps writing the file.
  const close = () => { if (!busy) onClose() }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className={'modal' + (busy ? ' is-busy' : '')} aria-busy={busy}>
        <h3>Καταχώριση νέου σχεδίου</h3>
        <form onSubmit={submit}>
          <table className="form-table">
            <tbody>
              <tr><th className="section-row" colSpan={4}>Σχέδιο</th></tr>
              <tr>
                <th>Αριθμός σχεδίου *</th>
                <td><input name="arithmosSxed" maxLength={50} required /></td>
                <th>Είδος σχεδίου</th>
                <td>
                  <input type="hidden" name="eidosId" value={eidosId} />
                  <ComboSelect options={lookups.eidosSxed} value={eidosId} allLabel="—" onChange={setEidosId} />
                </td>
              </tr>
              <tr>
                <th>Τίτλος σχεδίου</th>
                <td colSpan={3}><input name="titlosSxed" maxLength={500} /></td>
              </tr>
              <tr>
                <th>Περιγραφή σχεδίου</th>
                <td colSpan={3}><textarea name="perigrafhSxed" maxLength={2000} rows={2} /></td>
              </tr>

              <tr><th className="section-row" colSpan={4}>Έργο</th></tr>
              <tr>
                <th>Κωδικός έργου</th>
                <td><input name="kodikosErg" maxLength={50} /></td>
                <th>Κατηγορία έργου</th>
                <td>
                  <input type="hidden" name="kathgId" value={kathgId} />
                  <ComboSelect options={lookups.kathgoriaErg} value={kathgId} allLabel="—"
                               onChange={(id) => { setKathgId(id); setYpokatId('') }} />
                </td>
              </tr>
              <tr>
                <th>Υποκατηγορία έργου</th>
                <td>
                  <input type="hidden" name="ypokatId" value={ypokatId} />
                  <ComboSelect options={ypokat} value={ypokatId} allLabel="—" onChange={setYpokatId} />
                </td>
                <th>Περιγραφή έργου</th>
                <td><textarea name="perigrafhErg" maxLength={2000} rows={2} /></td>
              </tr>
              <tr>
                <th>Μονάδα</th>
                <td>
                  <input type="hidden" name="hstrId" value={hstrId} />
                  <ComboSelect options={lookups.monada} value={hstrId} allLabel="—" onChange={setHstrId} />
                </td>
                <th>Υπομονάδα</th>
                <td><input name="titlosErg" maxLength={500} /></td>
              </tr>

              <tr><th className="section-row" colSpan={4}>Πρόσθετες πληροφορίες</th></tr>
              <tr>
                <th>Χώρος αποθήκευσης</th>
                <td>
                  <input type="hidden" name="xorosId" value={xorosId} />
                  <ComboSelect options={lookups.xorosApoth} value={xorosId} allLabel="—" onChange={setXorosId} />
                </td>
                <th>Ημερομηνία</th>
                <td><input name="hmer" type="date" /></td>
              </tr>
              <tr>
                <th>Αρχείο *</th>
                <td colSpan={3}><input name="file" type="file" accept=".tif,.tiff,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp" required /></td>
              </tr>
            </tbody>
          </table>
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
              : <button type="button" onClick={close}>Κλείσιμο</button>}{' '}
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
      </div>
    </div>
  )
}
