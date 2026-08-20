import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pingSession } from '../../api/auth'
import { importDrawing, type UploadProgress } from '../../api/drawings'
import { AbortedError, UnauthorizedError } from '../../api/http'
import { appendMeta, EMPTY_META, type MetaValues } from '../meta/fields'

export type RowStatus =
  | { kind: 'pending' }
  | { kind: 'uploading'; progress: UploadProgress }
  | { kind: 'done'; id: number }
  | { kind: 'error'; message: string; aborted?: boolean }

export interface FileRow {
  key: number
  file: File
  /** Per-file only (never inherited): defaults to the file name without extension. */
  arithmosSxed: string
  /** Per-file fine-tuning; '' = inherit the common value. */
  overrides: MetaValues
  expanded: boolean
  status: RowStatus
}

let nextKey = 1

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function hasOverrides(o: MetaValues): boolean {
  return Object.values(o).some((v) => v !== '')
}

/** Effective metadata for one file: an override wins, otherwise the common value. */
export function effective(common: MetaValues, o: MetaValues): MetaValues {
  const out = { ...common }
  for (const k of Object.keys(o) as (keyof MetaValues)[]) if (o[k] !== '') out[k] = o[k]
  // An overridden category invalidates an inherited subcategory (it belongs to another parent).
  if (o.kathgId !== '' && o.ypokatId === '') out.ypokatId = ''
  return out
}

/**
 * The file list of «Μαζική καταχώριση» and the loop that uploads it.
 *
 * Files go one at a time through the normal import endpoint (one row each,
 * MAZIKI_KATAXWRISI = 1), so a failure in one file never affects the others and
 * every file gets its own progress and result. The caller owns the common
 * values; this hook only reads them when a run starts.
 */
export function useUploadQueue(common: MetaValues) {
  const [rows, setRows] = useState<FileRow[]>([])
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stopRef = useRef(false)
  const queryClient = useQueryClient()

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    if (!incoming.length) return
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.file.name + '|' + r.file.size))
      const fresh = incoming
        .filter((f) => !seen.has(f.name + '|' + f.size)) // the same file picked twice is added once
        .map<FileRow>((f) => ({
          key: nextKey++, file: f, arithmosSxed: stripExt(f.name),
          overrides: { ...EMPTY_META }, expanded: false, status: { kind: 'pending' },
        }))
      return [...prev, ...fresh]
    })
  }

  function patchRow(key: number, patch: Partial<FileRow> | ((r: FileRow) => Partial<FileRow>)) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)))
  }

  const removeRow = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key))
  const removeDone = () => setRows((prev) => prev.filter((r) => r.status.kind !== 'done'))

  function buildFormData(row: FileRow): FormData {
    const fd = new FormData()
    fd.append('file', row.file, row.file.name)
    // The drawing number is the row's own; everything else is common + overrides.
    appendMeta(fd, { ...effective(common, row.overrides), arithmosSxed: row.arithmosSxed.trim() })
    fd.append('maziki', '1')
    return fd
  }

  async function run() {
    const todo = rows.filter((r) => r.status.kind !== 'done')
    if (!todo.length) return
    setRunning(true)
    setRunError(null)
    stopRef.current = false
    let imported = 0
    try {
      for (const row of todo) {
        if (stopRef.current) break
        const ctrl = new AbortController()
        abortRef.current = ctrl
        patchRow(row.key, { status: { kind: 'uploading', progress: { loaded: 0, total: 0, saving: false } } })
        try {
          // Pre-flight before every file: catches an expired session before the
          // bytes go out and renews the sliding session during a long batch.
          await pingSession()
          const { id } = await importDrawing(
            buildFormData(row),
            (progress) => patchRow(row.key, { status: { kind: 'uploading', progress } }),
            ctrl.signal,
          )
          imported++
          patchRow(row.key, { status: { kind: 'done', id } })
        } catch (e) {
          if (e instanceof UnauthorizedError) throw e // session gone: stop the whole batch
          const aborted = e instanceof AbortedError
          patchRow(row.key, { status: { kind: 'error', message: (e as Error).message, aborted } })
          if (aborted) break
        }
      }
    } catch (e) {
      setRunError((e as Error).message)
      // Whatever was in flight when the session died shows as an error, not as stuck "sending".
      setRows((prev) => prev.map((r) => (r.status.kind === 'uploading'
        ? { ...r, status: { kind: 'error', message: (e as Error).message } } : r)))
    } finally {
      abortRef.current = null
      setRunning(false)
      if (imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['drawings'] })
        queryClient.invalidateQueries({ queryKey: ['lookups'] }) // Μονάδες-in-use may change
      }
    }
  }

  function stop() {
    stopRef.current = true
    abortRef.current?.abort()
  }

  const pendingRows = rows.filter((r) => r.status.kind !== 'done')
  const doneCount = rows.length - pendingRows.length
  const errorCount = rows.filter((r) => r.status.kind === 'error').length
  const missingNumber = pendingRows.filter((r) => !r.arithmosSxed.trim()).length
  const totalBytes = rows.reduce((s, r) => s + r.file.size, 0)
  const sentBytes = rows.reduce((s, r) => {
    if (r.status.kind === 'done') return s + r.file.size
    if (r.status.kind === 'uploading' && r.status.progress.total > 0)
      return s + Math.min(r.file.size, r.file.size * (r.status.progress.loaded / r.status.progress.total))
    return s
  }, 0)

  return {
    rows, running, runError,
    addFiles, patchRow, removeRow, removeDone, run, stop,
    patchOverride: (key: number, patch: Partial<MetaValues>) =>
      patchRow(key, (r) => ({ overrides: { ...r.overrides, ...patch } })),
    pendingRows, doneCount, errorCount, missingNumber, totalBytes, sentBytes,
    overallPct: totalBytes > 0 ? (sentBytes / totalBytes) * 100 : 0,
    // "Διακόπηκε" only when the loop stopped before reaching some files (Διακοπή / session loss).
    stoppedEarly: !running && rows.some((r) => r.status.kind === 'pending') && doneCount + errorCount > 0,
    canStart: !running && pendingRows.length > 0 && missingNumber === 0,
  }
}
