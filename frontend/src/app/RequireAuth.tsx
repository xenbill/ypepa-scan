import { Navigate, Outlet } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { getMe, loginUrl } from '../api/auth'
import { UnauthorizedError } from '../api/http'
import { LoadingBlock } from '../components/Loading'
import { StatusPage } from '../pages/StatusPage'

/** Gate: everything below requires a valid session cookie. The user it loads is
    passed down as the router outlet context, so screens read it with
    useOutletContext<UserInfo>() instead of fetching it again. */
export default function RequireAuth() {
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
