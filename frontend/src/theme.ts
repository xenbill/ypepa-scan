/** Light / dark theme. Three user choices — «Αυτόματο» (follow the OS / Windows
    setting), «Φωτεινό», «Σκοτεινό» — stored in localStorage; the resolved theme is
    set as <html data-theme="light|dark"> and index.css switches its variables on it.
    index.html runs the same logic inline before the app boots, so there's no flash.
    Older browsers: no matchMedia / prefers-color-scheme → «Αυτόματο» means light;
    matchMedia.addListener is used (addEventListener on MediaQueryList is newer). */

export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'ypepascan.theme'
const MQ = '(prefers-color-scheme: dark)'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch { return 'auto' }
}

function osDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MQ).matches
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return osDark() ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch { /* storage disabled: the choice lasts for this page load */ }
  applyTheme(pref)
}

/** Re-apply when the OS setting changes while in «Αυτόματο». Call once at boot. */
export function watchOsTheme(): void {
  if (typeof window.matchMedia !== 'function') return
  const mql = window.matchMedia(MQ)
  const onChange = () => { if (getThemePref() === 'auto') applyTheme('auto') }
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange)
  else if (typeof mql.addListener === 'function') mql.addListener(onChange) // older Chrome/Edge/Safari
}
