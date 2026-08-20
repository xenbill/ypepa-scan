import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDrawing } from '../api/drawings'
import type { DrawingRow, LookupData } from '../api/types'
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

  const mutation = useMutation({
    mutationFn: () => updateDrawing(drawing.sxedioId, metaToDrawingMeta(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drawing', drawing.sxedioId] })
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      onDone()
    },
  })

  return (
    <form className="meta-form" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <MetaForm values={values} onChange={setValues} lookups={lookups} current={drawing}>
        <div className="meta-section">
          <h4>Σχέδιο</h4>
          <MetaField k="arithmosSxed" required />
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
