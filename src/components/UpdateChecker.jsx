import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { APP_VERSION, VERSION_MANIFEST_URL, ANDROID_APK_URL } from '../constants/appVersion'
import { compareVersions } from '../constants/extension'

const isEN = typeof navigator !== 'undefined' && navigator.language.startsWith('en')
const tr = (fr, en) => (isEN ? en : fr)

// Settings → About: shows the running version and a manual "Check for updates"
// button. Complements the passive AppUpdateBanner. On Android it links to the
// fresh APK; on the web it reloads to pick up the new build.
export default function UpdateChecker() {
  const [state, setState] = useState({ status: 'idle', latest: null })
  const isNative = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())

  const check = async () => {
    setState({ status: 'checking', latest: null })
    try {
      const res = await fetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('bad status')
      const data = await res.json()
      const latest = String(data?.version || '')
      if (latest && compareVersions(latest, APP_VERSION) > 0) {
        setState({ status: 'available', latest })
      } else {
        setState({ status: 'uptodate', latest })
      }
    } catch {
      setState({ status: 'error', latest: null })
    }
  }

  const doUpdate = async () => {
    if (isNative) {
      try {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: ANDROID_APK_URL })
      } catch {
        window.open(ANDROID_APK_URL, '_blank')
      }
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 64 64" className="w-6 h-6" fill="none" aria-hidden="true">
            <polyline points="16,33 28,45 50,17" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="17" r="5" fill="#fff" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">SmartJobTracker</div>
          <div className="text-xs text-gray-400" title={`commit ${__COMMIT_HASH__}`}>v{APP_VERSION} · #{__COMMIT_COUNT__}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={check}
          disabled={state.status === 'checking'}
          className="text-sm font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {state.status === 'checking' ? tr('Vérification…', 'Checking…') : tr('Vérifier les mises à jour', 'Check for updates')}
        </button>
        {state.status === 'uptodate' && (
          <span className="text-sm text-green-600 font-medium">✓ {tr('Vous êtes à jour', 'You’re up to date')}</span>
        )}
        {state.status === 'error' && (
          <span className="text-sm text-gray-400">{tr('Vérification impossible', 'Couldn’t check right now')}</span>
        )}
      </div>

      {state.status === 'available' && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <span className="text-lg shrink-0">✨</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">{tr('Nouvelle version disponible', 'New version available')}</div>
            <div className="text-xs text-gray-500">v{state.latest}</div>
          </div>
          <button
            onClick={doUpdate}
            className="shrink-0 text-xs font-semibold bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all"
          >
            {isNative ? tr('Télécharger', 'Download') : tr('Rafraîchir', 'Refresh')}
          </button>
        </div>
      )}
    </div>
  )
}
