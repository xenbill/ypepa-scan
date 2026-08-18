import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logout, type UserInfo } from './api'

export default function Layout() {
  const user = useOutletContext<UserInfo>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  return (
    <>
      <header className="appbar">
        <div className="brand">
          <span className="brand-mark">ΣΥ</span>
          <h1>Σχέδια ΥΠΕΠΑ</h1>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Αρχική</NavLink>
          <NavLink to="/sxedia">Σχέδια</NavLink>
          <NavLink to="/lookups">Λίστες επιλογών</NavLink>
        </nav>
        <div className="appbar-right">
          Χρήστης: <strong>{user.username}</strong>
          <button onClick={() => navigate('/change-password')}>Αλλαγή κωδικού</button>
          <button onClick={() => logoutMutation.mutate()}>Αποσύνδεση</button>
        </div>
      </header>
      <main className="page">
        <Outlet context={user} />
      </main>
    </>
  )
}
