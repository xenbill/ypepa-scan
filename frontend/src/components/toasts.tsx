import { useEffect, useState } from 'react'

/**
 * Floating notifications (top center, under the app bar). Used for successes whose screen goes
 * away with the action — an import that returns to the list, a save that closes
 * the edit panel — so the confirmation survives the navigation. Errors stay
 * inline next to the action that caused them: they must not vanish on a timer.
 *
 * Module-level store so any screen can call showToast() without prop drilling;
 * the <Toasts> container is mounted once at the route root.
 */

export type ToastKind = 'success' | 'error'
interface Toast { id: number; text: string; kind: ToastKind }

let nextId = 1
let toasts: Toast[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const SHOW_MS = 4000

export function showToast(text: string, kind: ToastKind = 'success') {
  const t = { id: nextId++, text, kind }
  toasts = [...toasts, t]
  notify()
  setTimeout(() => dismiss(t.id), SHOW_MS)
}

function dismiss(id: number) {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export default function Toasts() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  if (toasts.length === 0) return null
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={'toast toast-' + t.kind} title="Κλικ για κλείσιμο"
                onClick={() => dismiss(t.id)}>
          {t.kind === 'success' ? '✓' : '⚠'} {t.text}
        </button>
      ))}
    </div>
  )
}
