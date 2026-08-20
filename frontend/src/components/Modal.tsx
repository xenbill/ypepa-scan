import { useEffect, useRef } from 'react'

// Every open dialog registers here, so Escape only ever reaches the topmost one
// and whatever is underneath (the viewer, which closes on Escape too) can tell
// that a dialog is in front of it.
const open: symbol[] = []

/** True while any dialog is open — see the viewer's own Escape handler. */
export const anyModalOpen = () => open.length > 0

interface ModalProps {
  /**
   * What to do when the user dismisses the dialog without using its buttons —
   * a click on the backdrop or Escape. Leave it out for a dialog holding work
   * the user has typed: it can then only be closed by its own buttons, so one
   * stray click or keypress cannot throw the work away. Escape is swallowed
   * either way, so nothing behind closes.
   */
  onDismiss?: () => void
  /** Extra classes on the dialog box, e.g. 'confirm-modal'. */
  className?: string
  /** Renders aria-busy; leave undefined for dialogs that are never busy. */
  busy?: boolean
  children: React.ReactNode
}

/**
 * The shell every dialog sits in: the dimmed backdrop, the box, and — where the
 * dialog allows it — dismissal. The dialogs themselves only bring content.
 */
export default function Modal({ onDismiss, className, busy, children }: ModalProps) {
  // Kept in a ref so the listener is registered once: `onDismiss` is usually a
  // fresh closure on every render, and re-registering would reorder the stack.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    const token = Symbol('modal')
    open.push(token)
    function onKey(e: KeyboardEvent) {
      // Only the topmost dialog reacts, and only if it can be dismissed.
      if (e.key !== 'Escape' || open[open.length - 1] !== token) return
      dismissRef.current?.()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      open.splice(open.indexOf(token), 1)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="modal-backdrop"
         onClick={(e) => { if (e.target === e.currentTarget) dismissRef.current?.() }}>
      <div className={'modal' + (className ? ' ' + className : '')} aria-busy={busy}>
        {children}
      </div>
    </div>
  )
}
