import { Capacitor } from '@capacitor/core'

// Origin of the deployed backend (Vercel serverless functions live under /api).
// Keep this on the canonical www host — see the SEO/canonical-host notes.
const API_ORIGIN = 'https://www.smartjobtracker.com'

/**
 * On the web the app is served from the same origin as its `/api/*` functions,
 * so every call site can use a relative path. Inside the native Capacitor shell
 * the webview origin is `https://localhost`, so those relative paths would
 * resolve to nothing. This shim rewrites `/api/*` requests to the deployed
 * backend. CapacitorHttp (enabled in capacitor.config.json) then routes them
 * through native networking, which sidesteps CORS on the cross-origin call.
 *
 * No-op on the web build, so it's safe to call unconditionally at startup.
 */
export function installNativeApiShim() {
  if (!Capacitor?.isNativePlatform?.()) return
  if (window.__nativeApiShimInstalled) return
  window.__nativeApiShimInstalled = true

  const nativeFetch = window.fetch.bind(window)

  const toAbsolute = (url) => {
    if (typeof url !== 'string') return url
    if (url.startsWith('/api/')) return API_ORIGIN + url
    const idx = url.indexOf('/api/')
    if (idx !== -1 && /^https?:\/\/localhost(?::\d+)?\//.test(url)) {
      return API_ORIGIN + url.slice(idx)
    }
    return url
  }

  window.fetch = (input, init) => {
    try {
      if (typeof input === 'string') {
        input = toAbsolute(input)
      } else if (input instanceof Request) {
        const rewritten = toAbsolute(input.url)
        if (rewritten !== input.url) input = new Request(rewritten, input)
      } else if (input instanceof URL) {
        const rewritten = toAbsolute(input.href)
        if (rewritten !== input.href) input = rewritten
      }
    } catch {
      /* fall through with the original input */
    }
    return nativeFetch(input, init)
  }
}
