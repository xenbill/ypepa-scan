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

// ---- text size ----------------------------------------------------------------
/** «Μέγεθος γραμμάτων»: normal / large / xlarge, stored in localStorage and set as
    <html data-size>. index.css applies a CSS zoom (1.1 / 1.2) to the app chrome, page
    content and the viewer's side panel (not the login page) — text and spacing scale together,
    like the browser's Ctrl+ but remembered per user. The drawing canvas itself is left
    alone so mouse zoom/pan coordinates stay exact. Browsers without CSS zoom (Firefox
    before 126) simply ignore it. */
export type TextSize = 'normal' | 'large' | 'xlarge'
const SIZE_KEY = 'ypepascan.fontSize'

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return v === 'large' || v === 'xlarge' ? v : 'normal'
  } catch { return 'normal' }
}

export function applyTextSize(size: TextSize = getTextSize()): void {
  if (size === 'normal') document.documentElement.removeAttribute('data-size')
  else document.documentElement.setAttribute('data-size', size)
}

export function setTextSize(size: TextSize): void {
  try {
    if (size === 'normal') localStorage.removeItem(SIZE_KEY)
    else localStorage.setItem(SIZE_KEY, size)
  } catch { /* storage disabled: lasts for this page load */ }
  applyTextSize(size)
}

/** Re-apply when the OS setting changes while in «Αυτόματο». Call once at boot. */
export function watchOsTheme(): void {
  if (typeof window.matchMedia !== 'function') return
  const mql = window.matchMedia(MQ)
  const onChange = () => { if (getThemePref() === 'auto') applyTheme('auto') }
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange)
  else if (typeof mql.addListener === 'function') mql.addListener(onChange) // older Chrome/Edge/Safari
}
