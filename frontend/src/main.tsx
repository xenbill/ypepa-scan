import { StrictMode } from 'react'
import { LoadingBlock } from './components/Loading'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import './index.css'
import { getMe, loginUrl, NotFoundError, UnauthorizedError } from './api/api'
import { ErrorBoundary, NotFoundPage, StatusPage } from './pages/StatusPage'
import App from './App'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LookupsPage from './pages/LookupsPage'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Viewer from './viewer/Viewer'

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

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onUnauthorized }),
  mutationCache: new MutationCache({ onError: onUnauthorized }),
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
  return <Viewer id={numId} onClose={() => navigate('/sxedia' + from)} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/sxedia" element={<App />} />
                <Route path="/lookups" element={<LookupsPage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
                {/* Unknown URL: a real 404 page (inside the app chrome) instead of a silent redirect. */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="/sxedio/:id" element={<ViewerRoute />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
