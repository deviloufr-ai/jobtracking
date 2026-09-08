import { Capacitor } from '@capacitor/core'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { ANDROID_APK_DOWNLOAD_URL } from '../constants/appVersion'

const isEN = typeof navigator !== 'undefined' && navigator.language.startsWith('en')
const tr = (fr, en) => (isEN ? en : fr)

// Bottom banner shown when a newer version is deployed. On Android (sideloaded,
// no auto-update) it links to the fresh APK; on the web it reloads to pick up
// the new build. Sits above the mobile bottom nav.
export default function AppUpdateBanner() {
  const { updateAvailable, latestVersion, dismiss } = useAppUpdate()
  if (!updateAvailable) return null

  const isNative = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())

  const handleAction = () => {
    if (isNative) {
      // Navigate the main frame to the apex APK URL. Its host differs from the app
      // host, so Capacitor's Bridge hands it to the system browser (ACTION_VIEW),
      // which downloads it — a Chrome Custom Tab (Browser.open) silently drops APK
      // downloads, and a same-host URL just no-ops in the WebView. See the comment
      // on ANDROID_APK_DOWNLOAD_URL. The Bridge cancels the WebView's own load, so
      // the app stays put.
      window.location.href = ANDROID_APK_DOWNLOAD_URL
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-4 z-50 w-[min(92vw,440px)]">
      <div className="flex items-center gap-3 bg-white border border-indigo-200 rounded-2xl shadow-xl shadow-indigo-500/10 px-4 py-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-lg">
          ✨
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {tr('Nouvelle version disponible', 'New version available')}
          </p>
          {latestVersion && (
            <p className="text-[11px] text-gray-400 truncate">v{latestVersion}</p>
          )}
        </div>
        <button
          onClick={handleAction}
          className="shrink-0 text-xs font-semibold bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all"
        >
          {isNative ? tr('Télécharger', 'Download') : tr('Rafraîchir', 'Refresh')}
        </button>
        <button
          onClick={dismiss}
          aria-label={tr('Ignorer', 'Dismiss')}
          className="shrink-0 w-8 h-8 -mr-1 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}
