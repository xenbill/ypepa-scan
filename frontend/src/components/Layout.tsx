import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { APP_RIGHTS, hasRight, logout, type UserInfo } from '../api/api'
import { APP_VERSION } from '../version'
import { getThemePref, setThemePref, type ThemePref } from '../theme'

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

  // Theme choice lives in localStorage (theme.ts); state here only re-renders the switch.
  const [theme, setTheme] = useState<ThemePref>(getThemePref)
  function pickTheme(t: ThemePref) { setThemePref(t); setTheme(t) }

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
        <Link to="/" className="brand" title={`Αρχική — έκδοση ${APP_VERSION}`}>
          <span className="brand-mark"><img src="/ypepa-emblem.png" alt="ΥΠΕΠΑ" /></span>
          <div>
            <h1>Σχέδια ΥΠΕΠΑ</h1>
            <span className="brand-sub">ΑΡΧΕΙΟ ΤΕΧΝΙΚΩΝ ΣΧΕΔΙΩΝ</span>
          </div>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>Αρχική</NavLink>
          <NavLink to="/drawings">Σχέδια</NavLink>
          {hasRight(user, 'ADMIN') && <NavLink to="/lookups">Λίστες επιλογών</NavLink>}
          <NavLink to="/manual">Οδηγίες</NavLink>
        </nav>
        <div className="appbar-right" ref={menuRef}>
          <button
            className={'user-menu-btn' + (menuOpen ? ' open' : '')}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={user.fullName || user.username}
          >
            <span className="user-avatar" aria-hidden="true">{initials(user)}</span>
            <strong className="user-menu-name">{user.fullName || user.username}</strong>
            <span className="user-caret" aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <div className="user-menu" role="menu">
              {/* Rights as granted in MIS (ADMIN implies the rest): ✓ = has it, dimmed = not. */}
              <div className="user-menu-rights" aria-label="Δικαιώματα">
                <div className="user-menu-rights-title">Δικαιώματα</div>
                <ul>
                  {APP_RIGHTS.map((r) => {
                    const ok = hasRight(user, r.right)
                    return (
                      <li key={r.right} className={ok ? 'granted' : 'missing'} title={ok ? 'Έχετε αυτό το δικαίωμα' : 'Δεν έχετε αυτό το δικαίωμα'}>
                        <span className="right-mark" aria-hidden="true">{ok ? '✓' : '–'}</span>
                        {r.label}
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="user-menu-theme" aria-label="Εμφάνιση">
                <span className="user-menu-theme-label">Εμφάνιση</span>
                <span className="theme-switch" role="radiogroup">
                  {([['auto', 'Αυτόματο'], ['light', 'Φωτεινό'], ['dark', 'Σκοτεινό']] as [ThemePref, string][]).map(([v, label]) => (
                    <button key={v} type="button" role="radio" aria-checked={theme === v}
                            className={theme === v ? 'active' : undefined}
                            title={v === 'auto' ? 'Ακολουθεί τη ρύθμιση των Windows' : undefined}
                            onClick={() => pickTheme(v)}>
                      {label}
                    </button>
                  ))}
                </span>
              </div>
              <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/change-password') }}>
                Αλλαγή κωδικού
              </button>
              <button role="menuitem" disabled={logoutMutation.isPending}
                      onClick={() => { setMenuOpen(false); logoutMutation.mutate() }}>
                Αποσύνδεση
              </button>
              <Link role="menuitem" className="user-menu-version" to="/manual?tab=version"
                    onClick={() => setMenuOpen(false)}>
                Έκδοση <span className="mono">v{APP_VERSION}</span>
              </Link>
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

/** Avatar initials. MIS display names look like «Ανθλγός (ΜΧ) Παπαδόπουλος Κωνσταντίνος (12345)»:
    drop the parenthesised parts (speciality, ΑΜΑ), then use surname + first name — the last
    two words — so the rank is skipped. Two words → both; one word → its first two letters. */
function initials(u: UserInfo): string {
  const src = (u.fullName || u.username).replace(/\([^)]*\)/g, ' ').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  const s = parts.length >= 2
    ? parts[parts.length - 2][0] + parts[parts.length - 1][0]
    : (parts[0] || u.username).slice(0, 2)
  return s.toUpperCase()
}
