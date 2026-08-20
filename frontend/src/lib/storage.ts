// localStorage without the try/catch at every call site: it throws when storage is
// disabled (locked-down PCs) or full, and a remembered preference is never worth
// breaking a screen over — a failed read or write just means "use the default".

export function readStored<T>(key: string, parse: (raw: string) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? null : parse(raw)
  } catch { return null }
}

export function writeStored(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* storage disabled or full */ }
}

/** Forgets a preference — used when the user picks the default again. */
export function clearStored(key: string): void {
  try { localStorage.removeItem(key) } catch { /* storage disabled */ }
}

/** Reads a JSON value; anything unparseable counts as "nothing stored". */
export function readStoredJson<T>(key: string): T | null {
  return readStored<T>(key, (raw) => {
    try { return JSON.parse(raw) as T } catch { return null }
  })
}

export function writeStoredJson(key: string, value: unknown): void {
  writeStored(key, JSON.stringify(value))
}
