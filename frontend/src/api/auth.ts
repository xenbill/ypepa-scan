// Session + rights. The server sets an HttpOnly session cookie on login and the
// browser sends it automatically on every same-origin request (fetch, img,
// iframe, tiles), so no token handling happens here. A 401 simply means
// "log in again".
import { errorFrom, getJson, request, sendJson } from './http'

export interface UserInfo {
  username: string
  fullName: string
  role: string
  category: number | null
  /** Application rights (see AppRight). ADMIN is expanded server-side to all rights. */
  rights: string[]
}

/** The five application rights of the legacy app, as registered in the MIS login
    database (APPLIC_ID 83) and returned per user by the login service:
    VIEW — search/list/view (baseline, required to log in), SCAN — Καταχώριση /
    Μαζική καταχώριση, PRINT — Λήψη πρωτοτύπου, EDIT_SCANNED_SXEDIO — Επεξεργασία /
    Διαγραφή, ADMIN — Λίστες επιλογών (+ everything else). */
export type AppRight = 'VIEW' | 'SCAN' | 'PRINT' | 'EDIT_SCANNED_SXEDIO' | 'ADMIN'

/** Display order + Greek labels (the legacy descriptions), e.g. for the user menu. */
export const APP_RIGHTS: { right: AppRight; label: string }[] = [
  { right: 'ADMIN', label: 'Διαχειριστής Εφαρμογής' },
  { right: 'VIEW', label: 'Προβολή Σχεδίων' },
  { right: 'SCAN', label: 'Σάρωση Σχεδίων' },
  { right: 'PRINT', label: 'Εκτύπωση Σχεδίων' },
  { right: 'EDIT_SCANNED_SXEDIO', label: 'Επεξεργασία Σχεδίου' },
]

export function hasRight(user: UserInfo | undefined, right: AppRight): boolean {
  const rights = user?.rights ?? []
  return rights.indexOf(right) >= 0 || rights.indexOf('ADMIN') >= 0
}

export interface AuthCategory {
  id: number
  name: string
}

/** Login page bootstrap: dev-user mode (no category) or MIS login (κατηγορία προσωπικού required). */
export interface AuthMode {
  devLogin: boolean
  categories: AuthCategory[]
}

interface AuthResponse {
  expiresAt: string
  user: UserInfo
}

/** Path to come back to after re-login: current path + query (never the login page itself). */
export function loginUrl(returnTo?: string): string {
  const here = returnTo ?? location.pathname + location.search
  return here && here !== '/' && !here.startsWith('/login')
    ? '/login?returnTo=' + encodeURIComponent(here)
    : '/login'
}

export const getAuthMode = () => getJson<AuthMode>('/api/auth/mode')
export const getMe = () => getJson<UserInfo>('/api/auth/me')

/** Cheap session check (used before large uploads so 401 is caught before the bytes go out). */
export const pingSession = () => getJson<UserInfo>('/api/auth/me')

export async function login(username: string, password: string, category: number | null): Promise<UserInfo> {
  const r = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, category }),
  })
  if (!r.ok) {
    // 401 here is "wrong credentials", not "session expired" — say so.
    throw await errorFrom(r, r.status === 401 ? 'Λάθος όνομα χρήστη ή κωδικός.' : undefined)
  }
  const auth = (await r.json()) as AuthResponse
  return auth.user
}

/** Server expires the session cookie. */
export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  sendJson('/api/auth/change-password', 'POST', { currentPassword, newPassword })

