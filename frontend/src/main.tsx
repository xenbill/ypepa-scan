import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import './index.css'
import { getMe } from './api/api'
import App from './App'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import LookupsPage from './pages/LookupsPage'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Viewer from './viewer/Viewer'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
})

/** Gate: everything below requires a valid session cookie. */
function RequireAuth() {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe, retry: false, staleTime: 5 * 60_000 })
  if (me.isPending) return <p>Έλεγχος σύνδεσης…</p>
  if (me.isError) return <Navigate to="/login" replace />
  return <Outlet context={me.data} />
}

function ViewerRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const numId = Number(id)
  if (!Number.isFinite(numId)) return <Navigate to="/sxedia" replace />
  return <Viewer id={numId} onClose={() => navigate('/sxedia')} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/sxedia" element={<App />} />
              <Route path="/lookups" element={<LookupsPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
            </Route>
            <Route path="/sxedio/:id" element={<ViewerRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
