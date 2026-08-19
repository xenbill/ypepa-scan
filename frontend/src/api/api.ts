import type { DrawingMeta, DrawingRow, Filters, LookupData, SearchResult, ViewInfo } from './types'

export class UnauthorizedError extends Error {
  constructor() { super('Απαιτείται σύνδεση.') }
}

export class NotFoundError extends Error {
  constructor() { super('Δεν βρέθηκε — ίσως έχει διαγραφεί.') }
}

/** Path to come back to after re-login: current path + query (never the login page itself). */
export function loginUrl(returnTo?: string): string {
  const here = returnTo ?? location.pathname + location.search
  return here && here !== '/' && !here.startsWith('/login')
    ? '/login?returnTo=' + encodeURIComponent(here)
    : '/login'
}

/** Cheap session check (used before large uploads so 401 is caught before the bytes go out). */
export const pingSession = () => getJson<UserInfo>('/api/auth/me')

export interface UserInfo {
  username: string
  fullName: string
  role: string
  category: number | null
}

export interface AuthCategory {
  id: number
  name: string
}

/** Login page bootstrap: dev-user mode (no category) or MIS login (κατηγορία προσωπικού required). */
export interface AuthMode {
  devLogin: boolean
  categories: AuthCategory[]
}

interface AuthResponse {
  expiresAt: string
  user: UserInfo
}

// Auth: the server sets an HttpOnly session cookie on login; the browser sends it
// automatically on every same-origin request (fetch, img, iframe, tiles), so no
// token handling happens here. A 401 simply means "log in again".

// ---- fetch helpers ---------------------------------------------------------
// `signal` comes from React Query: when a query is superseded (user changed the
// filters again) or its component unmounts, the in-flight request is aborted and
// the server request is cancelled (ASP.NET RequestAborted => CancellationToken).
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal })
  if (r.status === 401) throw new UnauthorizedError()
  if (r.status === 404) throw new NotFoundError()
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Σφάλμα διακομιστή (${r.status})`)
  }
  return r.json() as Promise<T>
}

// ---- auth ------------------------------------------------------------------
export const getAuthMode = () => getJson<AuthMode>('/api/auth/mode')

export async function login(username: string, password: string, category: number | null): Promise<UserInfo> {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, category }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null
    if (r.status === 401) throw new Error(body?.error ?? 'Λάθος όνομα χρήστη ή κωδικός.')
    throw new Error(body?.error ?? `Σφάλμα διακομιστή (${r.status})`)
  }
  const auth = (await r.json()) as AuthResponse
  return auth.user
}

/** Server expires the session cookie. */
export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export const getMe = () => getJson<UserInfo>('/api/auth/me')

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const r = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (r.status === 401) throw new UnauthorizedError()
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Σφάλμα διακομιστή (${r.status})`)
  }
}

// ---- drawings --------------------------------------------------------------
export const getLookups = (signal?: AbortSignal) => getJson<LookupData>('/api/lookups', signal)

export interface StatItem { name: string; count: number; /** lookup id to filter the list by; null = drawings without a value */ id: number | null }
export interface ArchiveStats { total: number; perKathgoria: StatItem[]; perEidos: StatItem[]; perMonada: StatItem[] }
export const getStats = (signal?: AbortSignal) => getJson<ArchiveStats>('/api/stats', signal)

export interface Sort {
  key: string
  dir: 'asc' | 'desc'
}

export function searchDrawings(f: Filters, sort: Sort | null, page: number, pageSize: number, signal?: AbortSignal): Promise<SearchResult> {
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
  return getJson<SearchResult>('/api/drawings?' + p, signal)
}

export const getDrawing = (id: number, signal?: AbortSignal) => getJson<DrawingRow>(`/api/drawings/${id}`, signal)
export const getViewInfo = (id: number, signal?: AbortSignal) => getJson<ViewInfo>(`/api/drawings/${id}/view`, signal)

/** Downloads via fetch so a 401 can be handled instead of showing an error page. */
export async function downloadFile(id: number): Promise<void> {
  const r = await fetch(`/api/drawings/${id}/file`)
  if (r.status === 401) throw new UnauthorizedError()
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  if (r.status === 401) throw new UnauthorizedError()
  if (!r.ok) throw new Error(`Σφάλμα αποθήκευσης (${r.status})`)
}

export class AbortedError extends Error {
  constructor() { super('Η αποστολή ακυρώθηκε.') }
}

export interface UploadProgress {
  /** bytes sent so far */
  loaded: number
  total: number
  /** true once all bytes are sent and the server is writing the BLOB */
  saving: boolean
}

/**
 * Upload via XMLHttpRequest — the only browser API that reports upload progress.
 * Aborting (signal) closes the connection; the server sees RequestAborted and its
 * CancellationToken cancels the BLOB write, so nothing half-written is committed.
 */
export function importDrawing(
  formData: FormData,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<{ id: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/drawings')
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress({ loaded: e.loaded, total: e.total, saving: e.loaded >= e.total })
    }
    xhr.upload.onload = () => { if (onProgress) onProgress({ loaded: 1, total: 1, saving: true }) }
    xhr.onerror = () => reject(new Error('Σφάλμα δικτύου κατά την αποστολή.'))
    xhr.onabort = () => reject(new AbortedError())
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new UnauthorizedError())
      // responseType=json => xhr.response is parsed (null when the body wasn't JSON)
      const body = xhr.response as { id?: number; error?: string } | null
      if (xhr.status < 200 || xhr.status >= 300)
        return reject(new Error(body?.error ?? `Σφάλμα διακομιστή (${xhr.status})`))
      if (body?.id == null) return reject(new Error('Μη έγκυρη απάντηση διακομιστή.'))
      resolve({ id: body.id })
    }
    if (signal) {
      if (signal.aborted) return reject(new AbortedError())
      signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.send(formData)
  })
}

export async function deleteDrawing(id: number): Promise<void> {
  const r = await fetch(`/api/drawings/${id}`, { method: 'DELETE' })
  if (r.status === 401) throw new UnauthorizedError()
  if (!r.ok) throw new Error(`Σφάλμα διαγραφής (${r.status})`)
}

// ---- lookup administration ---------------------------------------------------
export type LookupType = 'eidos' | 'kathgoria' | 'ypokatigoria' | 'xoros'

async function lookupCall(url: string, method: string, body?: object): Promise<void> {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) throw new UnauthorizedError()
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

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', tiff: 'TIFF', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', bmp: 'BMP', webp: 'WebP',
  dwg: 'DWG (AutoCAD)', zip: 'ZIP/Office', ole: 'Word/Excel (παλαιό)', unknown: 'Άγνωστος',
}

export function formatFileType(type: string | null | undefined): string {
  if (!type) return ''
  return FILE_TYPE_LABELS[type] ?? type.toUpperCase()
}
