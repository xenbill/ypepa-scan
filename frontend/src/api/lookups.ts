// The pick lists (είδος σχεδίου, κατηγορία/υποκατηγορία έργου, χώρος αποθήκευσης)
// plus their administration — «Λίστες επιλογών», ADMIN only.
import { getJson, sendJson } from './http'
import type { LookupData } from './types'

export const getLookups = (signal?: AbortSignal) => getJson<LookupData>('/api/lookups', signal)

export type LookupType = 'eidos' | 'kathgoria' | 'ypokatigoria' | 'xoros'

export const addLookup = (type: LookupType, name: string, parentId?: number | null) =>
  sendJson(`/api/lookups/${type}`, 'POST', { name, parentId: parentId ?? null })
export const updateLookup = (type: LookupType, id: number, name: string, parentId?: number | null) =>
  sendJson(`/api/lookups/${type}/${id}`, 'PUT', { name, parentId: parentId ?? null })
export const deleteLookup = (type: LookupType, id: number) =>
  sendJson(`/api/lookups/${type}/${id}`, 'DELETE')
