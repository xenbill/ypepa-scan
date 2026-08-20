import { lazy, Suspense } from 'react'
import {
  createBrowserRouter, createRoutesFromElements, Outlet, Route,
  useLocation, useNavigate, useParams,
} from 'react-router-dom'
import { LoadingBlock } from '../components/Loading'
import Toasts from '../components/toasts'
import { NotFoundPage, RouteErrorPage } from '../pages/StatusPage'
import RequireAuth from './RequireAuth'
import Layout from '../components/Layout'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'
import DrawingsPage from '../drawings/DrawingsPage'

// Heavy, rarely-first screens load as separate chunks so the initial bundle —
// which older PCs must download AND parse before the login page paints — stays
// small: the viewer drags in OpenSeadragon, the manual is a book of text, the
// import pages carry the whole metadata form + upload machinery.
const LookupsPage = lazy(() => import('../pages/LookupsPage'))
const ManualPage = lazy(() => import('../pages/ManualPage'))
const Viewer = lazy(() => import('../viewer/Viewer'))
const ImportPage = lazy(() => import('../drawings/import/ImportPage'))
const MassImportPage = lazy(() => import('../drawings/import/MassImportPage'))

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

function Root() {
  // Toasts live at the root so they survive navigation and also cover the
  // full-screen viewer, which renders outside the <Layout> chrome.
  return (
    <>
      <Suspense fallback={<LoadingBlock />}><Outlet /></Suspense>
      <Toasts />
    </>
  )
}

// A data router (not <BrowserRouter>) because the import pages guard against
// navigating away from unsaved work with useBlocker, which needs one.
export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Root />} errorElement={<RouteErrorPage />}>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/drawings" element={<DrawingsPage />} />
          {/* Static segments outrank /drawings/:id, so "import" is never read as an id. */}
          <Route path="/drawings/import" element={<ImportPage />} />
          <Route path="/drawings/import/mass" element={<MassImportPage />} />
          <Route path="/lookups" element={<LookupsPage />} />
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          {/* Unknown URL: a real 404 page (inside the app chrome) instead of a silent redirect. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/drawings/:id" element={<ViewerRoute />} />
      </Route>
    </Route>,
  ),
)
