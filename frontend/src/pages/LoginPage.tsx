import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { login } from '../api/api'

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
      {/* faint drafting linework behind the sheet — static inline SVG, nothing fetched */}
      <svg className="login-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"
           fill="none" aria-hidden="true">
        <g stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1.5">
          <circle cx="290" cy="420" r="185" />
          <circle cx="290" cy="420" r="122" />
          <path d="M290 195v450M65 420h450" />
          <path d="M290 420l152-104" />
          <path d="M1180 180h290v390h-290z" />
          <path d="M1180 365h145M1325 365v205M1325 180v105" />
          <path d="M1325 285a80 80 0 0 1 80 80" />
          <path d="M1180 148h290M1180 140v16M1470 140v16" />
          <path d="M1175 152l10-9M1465 152l10-9" />
          <path d="M175 785h250M175 785l205-125" />
          <path d="M255 785a80 80 0 0 0-13-42" />
        </g>
        <circle cx="290" cy="420" r="4" fill="#ffffff" fillOpacity="0.12" />
      </svg>
      <div className="login-box">
        <h1>Σχέδια ΥΠΕΠΑ</h1>
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
