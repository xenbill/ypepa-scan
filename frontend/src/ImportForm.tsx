import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { importDrawing } from './api'
import ComboSelect from './ComboSelect'
import type { LookupData } from './types'

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
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: importDrawing,
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

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
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
                <td colSpan={3}><input name="file" type="file" accept=".tif,.tiff,.pdf,.jpg,.jpeg,.png" required /></td>
              </tr>
            </tbody>
          </table>
          <p>
            <button className="primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Αποστολή…' : 'Καταχώριση'}
            </button>{' '}
            <button type="button" onClick={onClose}>Κλείσιμο</button>{' '}
            {mutation.isError && (
              <span className="status-err">{(mutation.error as Error).message}</span>
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
