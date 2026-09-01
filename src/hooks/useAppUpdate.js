import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { APP_VERSION, VERSION_MANIFEST_URL } from '../constants/appVersion'
import { compareVersions } from '../constants/extension'

const DISMISS_KEY = 'jobtrackr_update_dismissed'
const CHECK_INTERVAL_MS = 30 * 60 * 1000 // re-check every 30 min while open

// Detects when an update is available. Two cases:
//  • Native (Android): the app loads the live web, so only a NATIVE change needs
//    a new APK — flagged when version.json.minNative > the installed versionCode.
//  • Web: a stale tab behind the deployed APP_VERSION (rare, on a real bump).
// `?updatepreview=1` forces the banner on for testing/demo.
export function useAppUpdate() {
  const isNative = Capacitor.isNativePlatform()
  const preview = typeof window !== 'undefined' && /[?&]updatepreview=1/.test(window.location.search)

  const [latest, setLatest] = useState(null)                 // { version, minNative }
  const [installedBuild, setInstalledBuild] = useState(null) // native versionCode
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
  })

  // Installed native build number (Android versionCode), once.
  useEffect(() => {
    if (!isNative) return
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => setInstalledBuild(Number(info?.build) || 0))
      .catch(() => {})
  }, [isNative])

  useEffect(() => {
    if (preview) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.version) setLatest({ version: String(data.version), minNative: Number(data.minNative) || 0 })
      } catch { /* offline / blocked — skip */ }
    }
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [preview])

  const nativeUpdate = isNative && latest && installedBuild != null && latest.minNative > installedBuild
  const webUpdate = !isNative && latest && compareVersions(latest.version, APP_VERSION) > 0

  const target = preview ? 'preview'
    : nativeUpdate ? `native:${latest.minNative}`
    : webUpdate ? `web:${latest.version}`
    : null

  const updateAvailable = !!target && dismissed !== target

  const dismiss = useCallback(() => {
    if (!target) return
    try { localStorage.setItem(DISMISS_KEY, target) } catch {}
    setDismissed(target)
  }, [target])

  return {
    updateAvailable,
    nativeUpdate: !!nativeUpdate,
    latestVersion: preview ? `${APP_VERSION}+1` : latest?.version,
    currentVersion: APP_VERSION,
    dismiss,
  }
}
