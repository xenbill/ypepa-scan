import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { changePassword } from '../api/auth'

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const navigate = useNavigate()

  const mutation = useMutation({ mutationFn: () => changePassword(current, next) })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (next !== confirm) {
      setLocalError('Ο νέος κωδικός και η επιβεβαίωση δεν ταιριάζουν.')
      return
    }
    mutation.mutate()
  }

  return (
    <main className="page">
      <div className="login-box" style={{ margin: '48px auto' }}>
        <h1>Αλλαγή κωδικού</h1>
        <p className="login-note" style={{ marginBottom: 16 }}>Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.</p>
        {mutation.isSuccess ? (
          <>
            <p className="status-ok">Ο κωδικός άλλαξε.</p>
            <button className="primary login-submit" onClick={() => navigate('/')}>Επιστροφή στα σχέδια</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label className="login-field">
              <span>Τρέχων κωδικός</span>
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                autoFocus autoComplete="current-password" required />
            </label>
            <label className="login-field">
              <span>Νέος κωδικός</span>
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password" required minLength={6} />
            </label>
            <label className="login-field">
              <span>Επιβεβαίωση νέου κωδικού</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" required minLength={6} />
            </label>
            <button className="primary login-submit" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Αποθήκευση…' : 'Αλλαγή κωδικού'}
            </button>
            <button type="button" onClick={() => navigate('/')} style={{ width: '100%', marginTop: 8 }}>
              Ακύρωση
            </button>
            {(localError || mutation.isError) && (
              <p className="status-err">{localError ?? (mutation.error as Error).message}</p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
