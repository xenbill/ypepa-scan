import { lazy, StrictMode, Suspense } from 'react'
import { LoadingBlock } from './components/Loading'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import './index.css'
import { applyTextSize, applyTheme, watchOsTheme } from './theme'
import { getMe, loginUrl, NetworkError, NotFoundError, UnauthorizedError } from './api/api'
import { ErrorBoundary, NotFoundPage, StatusPage } from './pages/StatusPage'
import App from './App'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'

// Heavy, rarely-first screens load as separate chunks so the initial bundle —
// which older PCs must download AND parse before the login page paints — stays
// small: the viewer drags in OpenSeadragon, the manual is a book of text.
const LookupsPage = lazy(() => import('./pages/LookupsPage'))
const ManualPage = lazy(() => import('./pages/ManualPage'))
const Viewer = lazy(() => import('./viewer/Viewer'))

// Session expired (401) anywhere — a list refetch, a tile, a save, an upload — lands
// here once: drop all cached data and go to the login page, remembering where we were.
// Screens don't need their own 401 handling.
let redirecting = false
function onUnauthorized(err: unknown) {
  if (!(err instanceof UnauthorizedError) || redirecting) return
  if (location.pathname.startsWith('/login')) return
  redirecting = true
  queryClient.clear()
  // Full navigation (not the router) is fine and simplest from outside React;
  // the app re-boots on the login page with the cache already empty.
  location.assign(loginUrl())
}

// API unreachable anywhere (list, lookups, a save…) while already inside the app:
// reset the gate's session query so RequireAuth re-runs /api/auth/me, fails the
// same way, and renders the "Ο διακομιστής δεν αποκρίνεται" page with a retry —
// instead of each screen showing a bare "Failed to fetch" line. When the API is
// back, "Δοκιμή ξανά" re-renders the same URL (list filters, viewer id) unchanged.
function onNetworkError(err: unknown) {
  if (!(err instanceof NetworkError)) return
  if (location.pathname.startsWith('/login')) return // login page has its own message
  const me = queryClient.getQueryState(['me'])
  if (!me || me.status === 'error') return // gate already shows the page (or never loaded)
  queryClient.resetQueries({ queryKey: ['me'], exact: true })
}
function onError(err: unknown) {
  onUnauthorized(err)
  onNetworkError(err)
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      // Retrying a 401/404 only delays the message the user is going to see anyway.
      retry: (count, err) => count < 1 && !(err instanceof UnauthorizedError || err instanceof NotFoundError),
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
})

/** Gate: everything below requires a valid session cookie. */
function RequireAuth() {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false, staleTime: 5 * 60_000 })
  if (me.isPending) return <div className="page-loading"><LoadingBlock text="Έλεγχος σύνδεσης…" /></div>
  if (me.isError) {
    if (me.error instanceof UnauthorizedError) return <Navigate to={loginUrl()} replace />
    // Not a login problem: the API is down / unreachable. Don't bounce to the
    // login page (it would fail the same way) — say so and offer a retry.
    return (
      <main className="page">
        <StatusPage
          code="!"
          title="Ο διακομιστής δεν αποκρίνεται"
          message="Δεν ήταν δυνατή η επικοινωνία με την εφαρμογή. Ελέγξτε τη σύνδεσή σας ή δοκιμάστε ξανά σε λίγο."
          detail={(me.error as Error).message}
        >
          <button className="primary" disabled={me.isFetching} onClick={() => me.refetch()}>
            {me.isFetching ? 'Επανάληψη…' : 'Δοκιμή ξανά'}
          </button>
          {/* Full load: fresh boot at the home page (also re-checks the session). */}
          <button onClick={() => { location.href = '/' }}>Αρχική</button>
        </StatusPage>
      </main>
    )
  }
  return <Outlet context={me.data} />
}

function ViewerRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const numId = Number(id)
  if (!Number.isInteger(numId) || numId <= 0) return <main className="page"><NotFoundPage what="Το σχέδιο" /></main>
  // The list passes its query string in navigation state, so "Κλείσιμο" returns
  // to the same filtered/sorted page. Direct links (no state) just go to the list.
  const from = (location.state as { from?: string } | null)?.from ?? ''
  return <Viewer id={numId} onClose={() => navigate('/drawings' + from)} />
}

applyTheme()
applyTextSize()
watchOsTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={<LoadingBlock />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/drawings" element={<App />} />
                <Route path="/lookups" element={<LookupsPage />} />
                <Route path="/manual" element={<ManualPage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
                {/* Unknown URL: a real 404 page (inside the app chrome) instead of a silent redirect. */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="/drawings/:id" element={<ViewerRoute />} />
            </Route>
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
