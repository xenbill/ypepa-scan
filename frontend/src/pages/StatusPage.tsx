import { useEffect, type ReactNode } from 'react'
import { useNavigate, useRouteError } from 'react-router'

/** Shared layout for 404 / error / unreachable states: big code, title, note, actions. */
export function StatusPage({ code, title, message, children, detail }: {
  code: string
  title: string
  message?: ReactNode
  /** buttons */
  children?: ReactNode
  /** technical detail, collapsed */
  detail?: string
}) {
  return (
    <div className="status-page">
      <div className="status-art" aria-hidden="true">
        <svg width="96" height="72" viewBox="0 0 96 72" fill="none">
          <rect x="1" y="1" width="94" height="70" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9.5" y="9.5" width="77" height="53" stroke="currentColor" opacity="0.4" />
          <rect x="56.5" y="48.5" width="30" height="14" stroke="currentColor" opacity="0.7" />
          <path d="M20 24h32M20 33h40M20 42h24" stroke="currentColor" opacity="0.4" />
        </svg>
        <span className="status-code">{code}</span>
      </div>
      <h2>{title}</h2>
      {message && <p className="status-msg">{message}</p>}
      {children && <div className="status-actions">{children}</div>}
      {detail && (
        <details className="status-detail">
          <summary>Τεχνικές λεπτομέρειες</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </div>
  )
}

export function NotFoundPage({ what }: { what?: string }) {
  const navigate = useNavigate()
  return (
    <StatusPage
      code="404"
      title={what ? `${what} δεν βρέθηκε` : 'Η σελίδα δεν βρέθηκε'}
      message="Η διεύθυνση μπορεί να είναι λάθος, ή το στοιχείο να έχει διαγραφεί."
    >
      <button className="primary" onClick={() => navigate('/drawings')}>Λίστα σχεδίων</button>
      <button onClick={() => navigate('/')}>Αρχική</button>
    </StatusPage>
  )
}

/** 403 for a typed/bookmarked URL the user's rights don't cover; the links to
    the screen are already hidden. `message` says which right unlocks it. */
export function ForbiddenPage({ message }: { message: string }) {
  const navigate = useNavigate()
  return (
    <StatusPage code="403" title="Δεν έχετε πρόσβαση" message={message}>
      <button className="primary" onClick={() => navigate('/drawings')}>Λίστα σχεδίων</button>
      <button onClick={() => navigate('/')}>Αρχική</button>
    </StatusPage>
  )
}

/** The router's errorElement: catches render-time exceptions in any route so a
    bug in one screen doesn't leave the user with a blank page. */
export function RouteErrorPage() {
  const raw = useRouteError()
  useEffect(() => { console.error('Unhandled route error', raw) }, [raw])
  const error = raw instanceof Error ? raw : new Error(String(raw))
  return (
    <main className="page">
      <StatusPage
        code="!"
        title="Κάτι πήγε στραβά"
        message="Παρουσιάστηκε απρόσμενο σφάλμα στην εφαρμογή. Δοκιμάστε να φορτώσετε ξανά τη σελίδα."
        detail={`${error.name}: ${error.message}\n${error.stack ?? ''}`}
      >
        <button className="primary" onClick={() => location.reload()}>Επαναφόρτωση</button>
        <button onClick={() => { location.href = '/' }}>Αρχική</button>
      </StatusPage>
    </main>
  )
}
