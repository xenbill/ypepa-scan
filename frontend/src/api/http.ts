// The HTTP layer: one place that knows how a failed response becomes an Error.
// Everything above (auth.ts, drawings.ts, lookups.ts) only describes endpoints.

export class UnauthorizedError extends Error {
  constructor() { super('Απαιτείται σύνδεση.') }
}

export class NotFoundError extends Error {
  constructor() { super('Δεν βρέθηκε — ίσως έχει διαγραφεί.') }
}

/** Logged in, but the account lacks the application right for this action (403). */
export class ForbiddenError extends Error {
  constructor() { super('Δεν έχετε δικαίωμα για αυτή την ενέργεια.') }
}

/** The request never reached the server (API down, network off, proxy refused).
    Handled centrally in app/queryClient.ts: the auth gate re-checks and shows the
    "Ο διακομιστής δεν αποκρίνεται" page instead of a per-screen error line. */
export class NetworkError extends Error {
  constructor() { super('Δεν υπάρχει επικοινωνία με τον διακομιστή.') }
}

export class AbortedError extends Error {
  constructor() { super('Η αποστολή ακυρώθηκε.') }
}

/** fetch() that turns "server unreachable" into a NetworkError: the browser's
    opaque "Failed to fetch" TypeError, or a 502/503/504 from whatever sits in
    front of the app (IIS with the app pool stopped, the Vite dev proxy, a
    reverse proxy). Aborts (React Query cancelling a superseded query) pass through. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  let r: Response
  try {
    r = await fetch(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof TypeError) throw new NetworkError()
    throw e
  }
  if (r.status === 502 || r.status === 503 || r.status === 504) throw new NetworkError()
  if (r.status === 403) throw new ForbiddenError()
  return r
}

/** The server's own `{ error: "…" }` message when it sent one, else a generic line. */
export async function errorFrom(r: Response, fallback?: string): Promise<Error> {
  const body = (await r.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error ?? fallback ?? `Σφάλμα διακομιστή (${r.status})`)
}

// `signal` comes from React Query: when a query is superseded (user changed the
// filters again) or its component unmounts, the in-flight request is aborted and
// the server request is cancelled (ASP.NET RequestAborted => CancellationToken).
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await request(url, { signal })
  if (r.status === 401) throw new UnauthorizedError()
  if (r.status === 404) throw new NotFoundError()
  if (!r.ok) throw await errorFrom(r)
  return r.json() as Promise<T>
}

/**
 * A write (POST/PUT/DELETE) with an optional JSON body. `failMessage` is for
 * endpoints that answer with a bare status and no useful body — they get
 * "«…» (500)"; without it the server's own message is shown.
 */
export async function sendJson(url: string, method: string, body?: object, failMessage?: string): Promise<void> {
  const r = await request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) throw new UnauthorizedError()
  if (!r.ok) {
    if (failMessage) throw new Error(`${failMessage} (${r.status})`)
    throw await errorFrom(r)
  }
}
