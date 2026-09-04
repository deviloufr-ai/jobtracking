import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import { installNativeApiShim } from './services/nativeApi.js'
import { initNativeAuthDeepLink, initNativeAuthLifecycle } from './services/supabase.js'
import { initPushNotifications } from './services/pushNotifications.js'
import { initAnalytics } from './services/analytics.js'

// Initialize Mixpanel on app boot. Identity + signup tracking is wired through
// supabase.js's auth state listener; product events fire from their call sites.
initAnalytics()

// Route relative /api/* calls to the deployed backend when running inside the
// native Capacitor shell. No-op on the web build.
installNativeApiShim()

// Complete native Google sign-in when the OAuth redirect returns as a deep link.
// No-op on the web build.
initNativeAuthDeepLink()

// Keep the token-refresh timer aligned with the app's foreground state on native,
// so the session isn't dropped across background/resume. No-op on the web build.
initNativeAuthLifecycle()

// Register for Android FCM push and store the device token. No-op on the web.
initPushNotifications()

// Recover from stale lazy chunks. When the app is redeployed while a tab is
// still open, the loaded index references chunk hashes that no longer exist on
// the server; the next dynamic import() (html2pdf, jspdf, transformers…) 404s
// and fails with a "disallowed MIME type" / "error loading dynamically imported
// module" error. Reloading pulls the fresh index.html with the current hashes.
// Guarded by sessionStorage so a genuinely missing chunk can't loop forever.
function reloadOnStaleChunk(reason) {
  if (sessionStorage.getItem('chunk-reload')) return
  sessionStorage.setItem('chunk-reload', '1')
  console.warn('Reloading to recover from stale chunk:', reason)
  window.location.reload()
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnStaleChunk(e.payload?.message || 'preloadError')
})
// Clear the guard once a load completes cleanly so future deploys can recover too.
window.addEventListener('load', () => sessionStorage.removeItem('chunk-reload'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
