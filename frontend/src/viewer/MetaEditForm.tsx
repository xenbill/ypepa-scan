import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDrawing } from '../api/drawings'
import type { DrawingRow, LookupData } from '../api/types'
import { showToast } from '../components/toasts'
import { metaFromRow, metaToDrawingMeta, type MetaValues } from '../drawings/meta/fields'
import { MetaField, MetaForm } from '../drawings/meta/MetaForm'

/** «Επεξεργασία» in the viewer's side panel. Same fields as the import dialogs
    (META_FIELDS), stacked one per line because the panel is only 310px wide. */
export default function MetaEditForm({ drawing, lookups, onDone }: {
  drawing: DrawingRow
  lookups: LookupData
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<MetaValues>(() => metaFromRow(drawing))
  const [numberError, setNumberError] = useState<string>()

  const mutation = useMutation({
    mutationFn: () => updateDrawing(drawing.sxedioId, metaToDrawingMeta(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawing', drawing.sxedioId] })
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      showToast('Οι αλλαγές αποθηκεύτηκαν.')
      onDone()
    },
  })

  // Validated here (not by the browser) so the message shows inline at the field.
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (values.arithmosSxed.trim() === '') {
      setNumberError('Συμπληρώστε τον αριθμό σχεδίου.')
      return
    }
    mutation.mutate()
  }

  return (
    <form className="meta-form" onSubmit={submit} noValidate>
      <MetaForm values={values} lookups={lookups} current={drawing}
                onChange={(v) => {
                  setValues(v)
                  if (v.arithmosSxed.trim()) setNumberError(undefined)
                }}>
        <div className="meta-section">
          <h4>Σχέδιο</h4>
          <MetaField k="arithmosSxed" required error={numberError} />
          <MetaField k="eidosId" />
          <MetaField k="titlosSxed" />
          <MetaField k="perigrafhSxed" />
        </div>
        <div className="meta-section">
          <h4>Έργο</h4>
          <MetaField k="kodikosErg" />
          <MetaField k="kathgId" />
          <MetaField k="ypokatId" />
          <MetaField k="perigrafhErg" />
          <MetaField k="hstrId" />
          <MetaField k="titlosErg" />
        </div>
        <div className="meta-section">
          <h4>Πρόσθετες πληροφορίες</h4>
          <MetaField k="xorosId" />
          <MetaField k="hmer" />
        </div>
      </MetaForm>
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
