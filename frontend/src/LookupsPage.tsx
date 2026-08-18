import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addLookup, deleteLookup, getLookups, updateLookup, type LookupType } from './api'
import type { Lookup } from './types'
import ConfirmModal from './ConfirmModal'

const LISTS: { type: LookupType; title: string }[] = [
  { type: 'eidos', title: 'Είδη σχεδίου' },
  { type: 'kathgoria', title: 'Κατηγορίες έργου' },
  { type: 'ypokatigoria', title: 'Υποκατηγορίες έργου' },
  { type: 'xoros', title: 'Χώροι αποθήκευσης' },
]

export default function LookupsPage() {
  const [selected, setSelected] = useState<LookupType>('eidos')
  const lookupsQuery = useQuery({ queryKey: ['lookups'], queryFn: getLookups, staleTime: Infinity })
  const lk = lookupsQuery.data

  if (!lk) return <p>Φόρτωση…</p>

  const items: Record<LookupType, Lookup[]> = {
    eidos: lk.eidosSxed,
    kathgoria: lk.kathgoriaErg,
    ypokatigoria: lk.ypokatErg,
    xoros: lk.xorosApoth,
  }
  const current = LISTS.find((l) => l.type === selected)!

  return (
    <>
      <h2 className="page-title">Λίστες επιλογών</h2>
      <p className="page-note">
        Προσοχή: η μετονομασία μιας τιμής εμφανίζεται σε όλα τα σχέδια που τη
        χρησιμοποιούν — παλαιά και νέα. Διαγραφή επιτρέπεται μόνο αν η τιμή δεν
        χρησιμοποιείται. Οι Μονάδες δεν επεξεργάζονται εδώ (προέρχονται από τη
        δομή μονάδων).
      </p>
      <label className="field lookup-picker">
        <span>Λίστα</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value as LookupType)}>
          {LISTS.map((l) => <option key={l.type} value={l.type}>{l.title}</option>)}
        </select>
      </label>
      <div className="lookup-single">
        <LookupCard
          key={selected}
          title={current.title}
          type={selected}
          items={items[selected]}
          parents={selected === 'ypokatigoria' ? lk.kathgoriaErg : undefined}
        />
      </div>
    </>
  )
}

function LookupCard({ title, type, items, parents }: {
  title: string
  type: LookupType
  items: Lookup[]
  parents?: Lookup[]
}) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editParent, setEditParent] = useState('')
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Lookup | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lookups'] })
  const fail = (e: Error) => setError(e.message)

  const addMutation = useMutation({
    mutationFn: () => addLookup(type, newName.trim(), newParent ? Number(newParent) : null),
    onSuccess: () => { setNewName(''); setNewParent(''); setError(null); refresh() },
    onError: fail,
  })
  const updateMutation = useMutation({
    mutationFn: (id: number) => updateLookup(type, id, editName.trim(), editParent ? Number(editParent) : null),
    onSuccess: () => { setEditingId(null); setError(null); refresh() },
    onError: fail,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLookup(type, id),
    onSuccess: () => { setError(null); setToDelete(null); refresh() },
    onError: (e: Error) => { setToDelete(null); fail(e) },
  })

  const parentName = (id: number | null) => parents?.find((p) => p.id === id)?.name ?? ''

  function startEdit(l: Lookup) {
    setEditingId(l.id)
    setEditName(l.name)
    setEditParent(l.parentId != null ? String(l.parentId) : '')
  }

  return (
    <section className="card lookup-card">
      <h3>{title}</h3>
      <table>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              {editingId === l.id ? (
                <>
                  <td>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    {parents && (
                      <select value={editParent} onChange={(e) => setEditParent(e.target.value)}>
                        <option value="">— κατηγορία —</option>
                        {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="lookup-actions">
                    <button className="primary" disabled={!editName.trim() || updateMutation.isPending}
                            onClick={() => updateMutation.mutate(l.id)}>Αποθήκευση</button>
                    <button onClick={() => setEditingId(null)}>Ακύρωση</button>
                  </td>
                </>
              ) : (
                <>
                  <td>
                    {l.name}
                    {parents && l.parentId != null && <small> — {parentName(l.parentId)}</small>}
                  </td>
                  <td className="lookup-actions">
                    <button onClick={() => startEdit(l)}>Επεξεργασία</button>
                    <button disabled={deleteMutation.isPending}
                            onClick={() => setToDelete(l)}>Διαγραφή</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="lookup-add">
        <input placeholder="Νέα τιμή…" value={newName} onChange={(e) => setNewName(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && newName.trim() && addMutation.mutate()} />
        {parents && (
          <select value={newParent} onChange={(e) => setNewParent(e.target.value)}>
            <option value="">— κατηγορία —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button className="primary" disabled={!newName.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate()}>Προσθήκη</button>
      </div>
      {error && <p className="status-err">{error}</p>}
      {toDelete && (
        <ConfirmModal
          title="Διαγραφή τιμής"
          message={`Η τιμή «${toDelete.name}» θα διαγραφεί από τη λίστα. Θέλετε να συνεχίσετε;`}
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </section>
  )
}
