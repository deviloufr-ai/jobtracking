import { useState, useEffect, useCallback } from 'react'
import { LATEST_EXTENSION_VERSION, compareVersions, parseExtVersion } from '../constants/extension'

// localStorage key: stores the latest version the user chose to skip, so we don't
// nag on every load. A newer release (LATEST_EXTENSION_VERSION moves past the
// stored value) surfaces the modal again.
const DISMISS_KEY = 'jobtrackr_ext_update_dismissed'

// Detects the installed SmartJobTracker extension AND the version it advertises,
// then compares against the latest shipped version to decide if an update is due.
//
// Version source: the content script sets `data-jobtrackr-ext` on <html> to its
// version (and echoes it in the `jobtrackr-ext-pong` event). Builds from before
// version reporting set it to 'true' → treated as "installed, version unknown",
// which never triggers the update prompt (we can't know they're behind).
export function useExtensionUpdate() {
  const [installed, setInstalled] = useState(null) // null = checking, true/false
  const [installedVersion, setInstalledVersion] = useState(null)
  const [dismissedVersion, setDismissedVersion] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
  })

  useEffect(() => {
    let settled = false
    const settle = (isInstalled, version) => {
      if (settled) return
      settled = true
      setInstalled(isInstalled)
      setInstalledVersion(version)
    }

    // Method 1: attribute the content script sets immediately (value = version).
    const attr = document.documentElement.getAttribute('data-jobtrackr-ext')
    if (attr) {
      settle(true, parseExtVersion(attr))
      return
    }

    // Method 2: ping/pong. The pong detail carries the version on newer builds.
    const timeout = setTimeout(() => settle(false, null), 800)
    const handler = (e) => {
      clearTimeout(timeout)
      settle(true, parseExtVersion(e?.detail))
    }
    window.addEventListener('jobtrackr-ext-pong', handler, { once: true })
    window.dispatchEvent(new CustomEvent('jobtrackr-ext-ping'))
    return () => { clearTimeout(timeout); window.removeEventListener('jobtrackr-ext-pong', handler) }
  }, [])

  const updateAvailable =
    installed === true &&
    !!installedVersion &&
    compareVersions(installedVersion, LATEST_EXTENSION_VERSION) < 0

  // True once the user has skipped the current latest version.
  const dismissed = updateAvailable && dismissedVersion === LATEST_EXTENSION_VERSION

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, LATEST_EXTENSION_VERSION) } catch {}
    setDismissedVersion(LATEST_EXTENSION_VERSION)
  }, [])

  return {
    installed,                          // null | true | false
    installedVersion,                   // e.g. '1.5.1' or null (unknown)
    latestVersion: LATEST_EXTENSION_VERSION,
    updateAvailable,                    // a strictly-newer version is available
    dismissed,                          // user skipped this version's prompt
    dismiss,
  }
}
