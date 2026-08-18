import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { importDrawing } from './api'
import type { Lookup, LookupData } from './types'

interface ImportFormProps {
  lookups: LookupData
  onClose: () => void
}

export default function ImportForm({ lookups, onClose }: ImportFormProps) {
  const [kathgId, setKathgId] = useState('')
  const [lastId, setLastId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: importDrawing,
    onSuccess: ({ id }) => {
      setLastId(id)
      // New drawing must appear in any search page.
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
    },
  })

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    mutation.mutate(new FormData(form), {
      onSuccess: () => {
        form.reset()
        setKathgId('')
      },
    })
  }

  const ypokat = lookups.ypokatErg.filter((y) => !kathgId || y.parentId === Number(kathgId))

  const options = (items: Lookup[]) => [
    <option key="" value="">—</option>,
    ...items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>),
  ]

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
                <td><select name="eidosId">{options(lookups.eidosSxed)}</select></td>
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
                  <select name="kathgId" value={kathgId} onChange={(e) => setKathgId(e.target.value)}>
                    {options(lookups.kathgoriaErg)}
                  </select>
                </td>
              </tr>
              <tr>
                <th>Υποκατηγορία έργου</th>
                <td><select name="ypokatId">{options(ypokat)}</select></td>
                <th>Περιγραφή έργου</th>
                <td><input name="perigrafhErg" maxLength={2000} /></td>
              </tr>
              <tr>
                <th>Μονάδα</th>
                <td><select name="hstrId">{options(lookups.monada)}</select></td>
                <th>Υπομονάδα</th>
                <td><input name="titlosErg" maxLength={500} /></td>
              </tr>

              <tr><th className="section-row" colSpan={4}>Πρόσθετες πληροφορίες</th></tr>
              <tr>
                <th>Τοποθέτηση</th>
                <td><select name="xorosId">{options(lookups.xorosApoth)}</select></td>
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
