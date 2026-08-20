import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { LoadingBlock } from '../components/Loading'
import { NotFoundPage } from '../pages/StatusPage'
import RequireAuth from './RequireAuth'
import Layout from '../components/Layout'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'
import DrawingsPage from '../drawings/DrawingsPage'

// Heavy, rarely-first screens load as separate chunks so the initial bundle —
// which older PCs must download AND parse before the login page paints — stays
// small: the viewer drags in OpenSeadragon, the manual is a book of text.
const LookupsPage = lazy(() => import('../pages/LookupsPage'))
const ManualPage = lazy(() => import('../pages/ManualPage'))
const Viewer = lazy(() => import('../viewer/Viewer'))

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

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/drawings" element={<DrawingsPage />} />
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
  )
}
