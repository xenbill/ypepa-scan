import type { DrawingMeta, DrawingRow, Filters, LookupData, SearchResult, ViewInfo } from './types'

export class UnauthorizedError extends Error {
  constructor() { super('Απαιτείται σύνδεση.') }
}

export interface UserInfo {
  username: string
  fullName: string
  role: string
}

interface AuthResponse {
  token: string
  expiresAt: string
  user: UserInfo
}

// ---- token storage (same keys/pattern as meleti-manager) -------------------
const getToken = () => localStorage.getItem('authToken')

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function clearSession() {
  localStorage.removeItem('authToken')
  localStorage.removeItem('tokenExpiresAt')
  localStorage.removeItem('user')
}

// ---- fetch helpers ---------------------------------------------------------
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: authHeaders() })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) throw new Error(`Σφάλμα διακομιστή (${r.status})`)
  return r.json() as Promise<T>
}

// ---- auth ------------------------------------------------------------------
export async function login(username: string, password: string): Promise<UserInfo> {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (r.status === 401) throw new Error('Λάθος όνομα χρήστη ή κωδικός.')
  if (!r.ok) throw new Error(`Σφάλμα διακομιστή (${r.status})`)
  const auth = (await r.json()) as AuthResponse
  localStorage.setItem('authToken', auth.token)
  localStorage.setItem('tokenExpiresAt', auth.expiresAt)
  localStorage.setItem('user', JSON.stringify(auth.user))
  return auth.user
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() })
  } finally {
    clearSession()
  }
}

export const getMe = () => getJson<UserInfo>('/api/auth/me')

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const r = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Σφάλμα διακομιστή (${r.status})`)
  }
}

// ---- drawings --------------------------------------------------------------
export const getLookups = () => getJson<LookupData>('/api/lookups')

export interface StatItem { name: string; count: number }
export interface ArchiveStats { total: number; perKathgoria: StatItem[]; perEidos: StatItem[]; perMonada: StatItem[] }
export const getStats = () => getJson<ArchiveStats>('/api/stats')

export interface Sort {
  key: string
  dir: 'asc' | 'desc'
}

export function searchDrawings(f: Filters, sort: Sort | null, page: number, pageSize: number): Promise<SearchResult> {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.kathg) p.set('kathg', f.kathg)
  if (f.ypokat) p.set('ypokat', f.ypokat)
  if (f.eidos) p.set('eidos', f.eidos)
  if (f.xoros) p.set('xoros', f.xoros)
  if (f.hstr) p.set('hstr', f.hstr)
  if (f.insFrom) p.set('insFrom', f.insFrom)
  if (f.insTo) p.set('insTo', f.insTo)
  if (sort) { p.set('sortBy', sort.key); p.set('sortDir', sort.dir) }
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  return getJson<SearchResult>('/api/drawings?' + p)
}

export const getDrawing = (id: number) => getJson<DrawingRow>(`/api/drawings/${id}`)
export const getViewInfo = (id: number) => getJson<ViewInfo>(`/api/drawings/${id}/view`)

/** Downloads via fetch so the Authorization header is sent (plain links can't). */
export async function downloadFile(id: number): Promise<void> {
  const r = await fetch(`/api/drawings/${id}/file`, { headers: authHeaders() })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) throw new Error(`Σφάλμα λήψης (${r.status})`)
  const disposition = r.headers.get('Content-Disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)
  const name = match ? decodeURIComponent(match[1]) : `sxedio-${id}`
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function updateDrawing(id: number, meta: DrawingMeta): Promise<void> {
  const r = await fetch(`/api/drawings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(meta),
  })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) throw new Error(`Σφάλμα αποθήκευσης (${r.status})`)
}

export async function importDrawing(formData: FormData): Promise<{ id: number }> {
  const r = await fetch('/api/drawings', { method: 'POST', headers: authHeaders(), body: formData })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Σφάλμα διακομιστή (${r.status})`)
  }
  return r.json() as Promise<{ id: number }>
}

export async function deleteDrawing(id: number): Promise<void> {
  const r = await fetch(`/api/drawings/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) throw new Error(`Σφάλμα διαγραφής (${r.status})`)
}

// ---- lookup administration ---------------------------------------------------
export type LookupType = 'eidos' | 'kathgoria' | 'ypokatigoria' | 'xoros'

async function lookupCall(url: string, method: string, body?: object): Promise<void> {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) { clearSession(); throw new UnauthorizedError() }
  if (!r.ok) {
    const b = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(b?.error ?? `Σφάλμα διακομιστή (${r.status})`)
  }
}

export const addLookup = (type: LookupType, name: string, parentId?: number | null) =>
  lookupCall(`/api/lookups/${type}`, 'POST', { name, parentId: parentId ?? null })
export const updateLookup = (type: LookupType, id: number, name: string, parentId?: number | null) =>
  lookupCall(`/api/lookups/${type}/${id}`, 'PUT', { name, parentId: parentId ?? null })
export const deleteLookup = (type: LookupType, id: number) =>
  lookupCall(`/api/lookups/${type}/${id}`, 'DELETE')

export function formatDate(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('el-GR')
}

/** Bytes → "12,3 MB" (el-GR), '' when unknown. */
export function formatMb(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  return (bytes / 1048576).toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB'
}
