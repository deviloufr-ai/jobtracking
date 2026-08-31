import { useState, useEffect, useCallback } from 'react'
import { APP_VERSION, VERSION_MANIFEST_URL } from '../constants/appVersion'
import { compareVersions } from '../constants/extension'

const DISMISS_KEY = 'jobtrackr_update_dismissed'
const CHECK_INTERVAL_MS = 30 * 60 * 1000 // re-check every 30 min while open

// Detects when the deployed app is newer than the running one. Works for a
// stale web tab and — the main case — a sideloaded Android APK, which can't
// auto-update. Compares the baked APP_VERSION against the live /version.json.
// `?updatepreview=1` forces the banner on for testing/demo.
export function useAppUpdate() {
  const [latest, setLatest] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
  })

  const preview = typeof window !== 'undefined' && /[?&]updatepreview=1/.test(window.location.search)

  useEffect(() => {
    if (preview) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.version) setLatest(String(data.version))
      } catch { /* offline / blocked — just skip this check */ }
    }
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [preview])

  const dismiss = useCallback(() => {
    const v = preview ? 'preview' : latest
    try { localStorage.setItem(DISMISS_KEY, v) } catch {}
    setDismissed(v)
  }, [latest, preview])

  const isNewer = !!latest && compareVersions(latest, APP_VERSION) > 0
  const updateAvailable = preview
    ? dismissed !== 'preview'
    : isNewer && latest !== dismissed

  return {
    updateAvailable,
    latestVersion: preview ? `${APP_VERSION}+1` : latest,
    currentVersion: APP_VERSION,
    dismiss,
  }
}
