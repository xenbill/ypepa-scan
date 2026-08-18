import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { login } from './api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/', { replace: true })
    },
  })

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-brand">
          <span className="brand-mark">ΣΥ</span>
          <h1>Σχέδια ΥΠΕΠΑ</h1>
        </div>
        <p className="login-note">Αρχείο τεχνικών σχεδίων — συνδεθείτε για να συνεχίσετε.</p>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
          <label>Όνομα χρήστη
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </label>
          <label>Κωδικός
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Σύνδεση…' : 'Σύνδεση'}
          </button>
          {mutation.isError && <p className="status-err">{(mutation.error as Error).message}</p>}
        </form>
      </div>
    </div>
  )
}
