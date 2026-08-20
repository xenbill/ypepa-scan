// Everything that reads or writes a drawing: search, view info, upload, edit, delete.
import { AbortedError, getJson, NetworkError, request, sendJson, UnauthorizedError } from './http'
import type { DrawingMeta, DrawingRow, Filters, SearchResult, ViewInfo } from './types'

export interface Sort {
  key: string
  dir: 'asc' | 'desc'
}

export interface StatItem { name: string; count: number; /** lookup id to filter the list by; null = drawings without a value */ id: number | null }
export interface ArchiveStats { total: number; perKathgoria: StatItem[]; perEidos: StatItem[]; perMonada: StatItem[] }
export const getStats = (signal?: AbortSignal) => getJson<ArchiveStats>('/api/stats', signal)

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

export const updateDrawing = (id: number, meta: DrawingMeta) =>
  sendJson(`/api/drawings/${id}`, 'PUT', meta, 'Σφάλμα αποθήκευσης')

export const deleteDrawing = (id: number) =>
  sendJson(`/api/drawings/${id}`, 'DELETE', undefined, 'Σφάλμα διαγραφής')

/** Downloads via fetch so a 401 can be handled instead of showing an error page. */
export async function downloadFile(id: number): Promise<void> {
  const r = await request(`/api/drawings/${id}/file`)
  if (r.status === 401) throw new UnauthorizedError()
  if (!r.ok) throw new Error(`Σφάλμα λήψης (${r.status})`)
  const disposition = r.headers.get('Content-Disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)
  const name = match ? decodeURIComponent(match[1]) : `drawing-${id}`
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
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
    xhr.onerror = () => reject(new NetworkError())
    xhr.onabort = () => reject(new AbortedError())
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new UnauthorizedError())
      if (xhr.status === 502 || xhr.status === 503 || xhr.status === 504) return reject(new NetworkError())
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
