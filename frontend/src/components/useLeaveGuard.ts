import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'

/**
 * Guards a page holding unsaved work (the import pages). While `when()` returns
 * true, in-app navigation is intercepted — the caller renders a confirm dialog
 * from the returned blocker (`state === 'blocked'`, `proceed()` / `reset()`) —
 * and closing or reloading the tab triggers the browser's own confirmation.
 *
 * `when` is a function, not a boolean, so it is evaluated at the moment of
 * navigation and can consult refs — e.g. an "intentional leave" flag a page
 * sets right before its own post-success navigate(). Needs the data router
 * (createBrowserRouter): useBlocker does not work under a plain BrowserRouter.
 */
export function useLeaveGuard(when: () => boolean) {
  const whenRef = useRef(when)
  whenRef.current = when

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    whenRef.current() && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!whenRef.current()) return
      e.preventDefault()
      e.returnValue = '' // older browsers only show the prompt with a value set
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return blocker
}
