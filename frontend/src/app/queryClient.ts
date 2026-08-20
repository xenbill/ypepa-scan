// The shared React Query client and, with it, the app's answer to the two
// failures every screen can hit: the session expired, or the API is unreachable.
// Handling them here is why no screen needs its own 401 / offline branch.
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { loginUrl } from '../api/auth'
import { NetworkError, NotFoundError, UnauthorizedError } from '../api/http'

// Session expired (401) anywhere — a list refetch, a tile, a save, an upload — lands
// here once: drop all cached data and go to the login page, remembering where we were.
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

export const queryClient = new QueryClient({
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
