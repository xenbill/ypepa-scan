import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAuthMode, login } from '../api/auth'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [category, setCategory] = useState<number | null>(null)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  // Where to go after login: the page the session expired on (same-origin path only).
  const rt = params.get('returnTo')
  const returnTo = rt && rt.startsWith('/') && !rt.startsWith('//') && !rt.startsWith('/login') ? rt : '/'

  // Dev mode: plain username/password. MIS mode: ΑΜΑ + κατηγορία προσωπικού (list comes from the login service).
  const mode = useQuery({ queryKey: ['auth-mode'], queryFn: getAuthMode, staleTime: 5 * 60_000 })
  const misLogin = mode.data ? !mode.data.devLogin : false
  const categories = mode.data?.categories ?? []

  const mutation = useMutation({
    mutationFn: () => login(username, password, misLogin ? category : null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate(returnTo, { replace: true })
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

      <div className="login-panel">
        <div className="login-box">
          <div className="login-head">
            <img className="login-emblem" src="/ypepa-emblem.png" alt="ΥΠΕΠΑ" />
            <div>
              <div className="login-eyebrow">Αρχείο τεχνικών σχεδίων</div>
              <h1>Σχέδια ΥΠΕΠΑ</h1>
              <p className="login-note">Συνδεθείτε για να συνεχίσετε.</p>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} noValidate={!misLogin}>
            <label className="login-field">
              <span>Όνομα χρήστη</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                     autoFocus autoComplete="username" spellCheck={false} />
            </label>
            <label className="login-field">
              <span>Κωδικός</span>
              <span className="login-pw">
                <input type={showPw ? 'text' : 'password'} value={password}
                       onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                <button type="button" className="login-pw-toggle" tabIndex={-1}
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
                        title={showPw ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}>
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.6A2 2 0 0 0 13.4 13.4M9.9 5.1A10.4 10.4 0 0 1 12 4.9c5 0 8.6 3.8 10 7.1a11.6 11.6 0 0 1-3.2 4.3M6.4 6.4C4.2 7.9 2.7 10 2 12c1.4 3.3 5 7.1 10 7.1 1.6 0 3.1-.4 4.4-1" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12c1.4-3.3 5-7.1 10-7.1s8.6 3.8 10 7.1c-1.4 3.3-5 7.1-10 7.1S3.4 15.3 2 12z" />
                      <circle cx="12" cy="12" r="2.6" />
                    </svg>
                  )}
                </button>
              </span>
            </label>
            {misLogin && (
              <label className="login-field">
                <span>Κατηγορία προσωπικού</span>
                <select value={category ?? ''} onChange={(e) => setCategory(e.target.value ? Number(e.target.value) : null)} required>
                  <option value="">— επιλέξτε —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {misLogin && !mode.isLoading && categories.length === 0 && (
              <p className="login-err" role="alert">Η υπηρεσία σύνδεσης δεν επέστρεψε κατηγορίες προσωπικού.</p>
            )}
            {mutation.isError && (
              <p className="login-err" role="alert">{(mutation.error as Error).message}</p>
            )}
            <button className="primary login-submit" type="submit" disabled={mutation.isPending || mode.isLoading}>
              {mutation.isPending ? 'Σύνδεση…' : 'Σύνδεση'}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
