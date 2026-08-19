import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logout, type UserInfo } from '../api/api'

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

  // User menu (top right): closes on outside click, Escape, or picking an item.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <>
      <header className="appbar">
        <Link to="/" className="brand" title="Αρχική">
          <span className="brand-mark"><img src="/ypepa-emblem.png" alt="ΥΠΕΠΑ" /></span>
          <div>
            <h1>Σχέδια ΥΠΕΠΑ</h1>
            <span className="brand-sub">ΑΡΧΕΙΟ ΤΕΧΝΙΚΩΝ ΣΧΕΔΙΩΝ</span>
          </div>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>Αρχική</NavLink>
          <NavLink to="/drawings">Σχέδια</NavLink>
          <NavLink to="/lookups">Λίστες επιλογών</NavLink>
        </nav>
        <div className="appbar-right" ref={menuRef}>
          <button
            className={'user-menu-btn' + (menuOpen ? ' open' : '')}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={user.fullName && user.fullName !== user.username ? user.fullName : undefined}
          >
            <span className="user-avatar" aria-hidden="true">{initials(user)}</span>
            <strong>{user.username}</strong>
            <span className="user-caret" aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <div className="user-menu" role="menu">
              <div className="user-menu-head">
                <strong>{user.fullName || user.username}</strong>
                {user.fullName && user.fullName !== user.username && <span>{user.username}</span>}
              </div>
              <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/change-password') }}>
                Αλλαγή κωδικού
              </button>
              <button role="menuitem" disabled={logoutMutation.isPending}
                      onClick={() => { setMenuOpen(false); logoutMutation.mutate() }}>
                Αποσύνδεση
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="page">
        <Outlet context={user} />
      </main>
    </>
  )
}

function initials(u: UserInfo): string {
  const src = (u.fullName || u.username).trim()
  const parts = src.split(/\s+/).filter(Boolean)
  const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2)
  return s.toUpperCase()
}
