import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { onAuthChange as analyticsOnAuthChange } from './analytics'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Custom URL scheme the native app registers (see AndroidManifest.xml). Google
// blocks OAuth inside the webview, so on native we open the flow in the system
// browser and Supabase redirects back here as a deep link.
const NATIVE_AUTH_REDIRECT = 'com.smartjobtracker.app://auth-callback'

// Gmail/Calendar scopes requested at native login so the Google provider token
// can drive the Gmail import (kept in sync with services/gmail.js SCOPES).
const NATIVE_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
}

// Supabase must NOT go through Capacitor's HTTP layer. On the native build,
// CapacitorHttp (enabled in capacitor.config.json) monkey-patches window.fetch to
// route every non-GET request through native networking. That path drops the
// per-user Authorization Bearer JWT on Supabase writes, so under RLS the
// UPDATE/INSERT matches zero rows and returns 200 with an empty body and NO error
// — the mutation silently never syncs (GET reads stay on the original fetch, which
// is why the breakage looked one-directional: cross-device pulls worked, pushes
// from Android didn't). Capacitor preserves the untouched browser fetch as
// window.CapacitorWebFetch (see @capacitor/android native-bridge.js). Route
// supabase-js through it so requests keep real fetch semantics + CORS — the app is
// served from the www origin, which Supabase's REST API allows. Resolved lazily
// per call so it's a no-op on web, where CapacitorWebFetch is absent and plain
// fetch is used (identical to the previous default).
// ── Native-login diagnostic ring buffer ──────────────────────────────────────
// A persisted trail of auth transitions + any /auth/v1 error the server returned.
// On Android we can't read the console, and a "logs in → bounced back to login"
// loop is caused by a silent SIGNED_OUT (a refresh the server rejected). This lets
// the login screen surface the exact reason so it can be screenshotted.
const AUTH_DIAG_KEY = 'jobtrackr_auth_diag'
function recordAuthDiag(entry) {
  try {
    const arr = JSON.parse(localStorage.getItem(AUTH_DIAG_KEY) || '[]')
    arr.push({ ...entry, at: new Date().toISOString() })
    while (arr.length > 12) arr.shift()
    localStorage.setItem(AUTH_DIAG_KEY, JSON.stringify(arr))
  } catch { /* diagnostics must never throw into auth */ }
}
export function getAuthDiag() {
  try { return JSON.parse(localStorage.getItem(AUTH_DIAG_KEY) || '[]') } catch { return [] }
}
export function clearAuthDiag() {
  try { localStorage.removeItem(AUTH_DIAG_KEY) } catch { /* ignore */ }
}

const supabaseFetch = async (...args) => {
  const useNative = typeof window !== 'undefined' && typeof window.CapacitorWebFetch === 'function'
  const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '')
  const isAuth = /\/auth\/v1\//.test(url)
  const path = () => url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
  try {
    const res = await (useNative ? window.CapacitorWebFetch(...args) : fetch(...args))
    // The refresh 400/401 that silently ends the session is exactly what we can't
    // otherwise see on Android — capture its status + body.
    if (isAuth && !res.ok) {
      let body = ''
      try { body = (await res.clone().text()).slice(0, 300) } catch { /* ignore */ }
      recordAuthDiag({ kind: 'auth_http', status: res.status, path: path(), body })
    }
    return res
  } catch (err) {
    if (isAuth) recordAuthDiag({ kind: 'auth_throw', path: path(), message: err?.message || String(err) })
    throw err
  }
}

// createClient throws on an empty URL/key, which would crash the whole app at
// import time and render a blank white screen (this bit the first Android build
// whose CI had no Supabase env vars). Fall back to harmless placeholders so the
// app still loads — in local-only mode (localStorage) — when unconfigured.
// Use isSupabaseConfigured() to gate anything that needs a real backend.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    global: { fetch: supabaseFetch },
    auth: {
      // Persist the session across reloads and refresh tokens automatically.
      persistSession: true,
      autoRefreshToken: true,
      // Detect & consume the OAuth redirect (?code=… / #access_token=…) on load so
      // the Google sign-in callback works without a dedicated router/route.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }
)

// ── Auth identity (auth.uid()) ────────────────────────────────────────────────
// The Supabase user id is now the canonical sync identity (replaces the old
// gmail-derived sync UUID). Cache it synchronously so non-React modules
// (deduplicateService, useJobs) can read it without awaiting.
let cachedAuthUserId = null
supabase.auth.getSession().then(({ data }) => { cachedAuthUserId = data.session?.user?.id || null })
supabase.auth.onAuthStateChange((event, session) => {
  cachedAuthUserId = session?.user?.id || null
  // Trace every auth transition: the event, whether a session survived it, and the
  // token expiry (a token exp far from the device clock = the refresh loop that
  // bounces native users to login). Feeds the login-screen diagnostic.
  recordAuthDiag({
    kind: 'event',
    event,
    hasSession: !!session,
    expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  })
  // Mixpanel identity: identify on login / re-open (INITIAL_SESSION, SIGNED_IN),
  // fire signup_completed for a brand-new account, reset() on SIGNED_OUT.
  try { analyticsOnAuthChange(event, session) } catch { /* analytics must never break auth */ }
})

// Synchronous best-effort accessor (may be null before the session loads).
export function getAuthUserId() {
  return cachedAuthUserId
}

// Async accessor that waits for the session — use when you can await.
export async function resolveAuthUserId() {
  if (cachedAuthUserId) return cachedAuthUserId
  const { data } = await supabase.auth.getSession()
  cachedAuthUserId = data.session?.user?.id || null
  return cachedAuthUserId
}

// Helper to get current user
export async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()
  if (error) {
    console.error('Error getting current user:', error)
    return null
  }
  return user
}

// Helper to get current session
export async function getSession() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession()
  if (error) {
    console.error('Error getting session:', error)
    return null
  }
  return session
}

// Sign in anonymously (for multi-device sync)
// This gives us a user ID without OAuth redirects
export async function signInAnonymously() {
  try {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    return data
  } catch (err) {
    console.error('Error signing in anonymously:', err)
    throw err
  }
}

// Sign in with Google
export async function signInWithGoogle() {
  // Native (Android/iOS): Google refuses OAuth inside a webview, so run the flow
  // in the system browser and catch the redirect via a deep link. See
  // signInWithGoogleNative / initNativeAuthDeepLink below.
  if (Capacitor.isNativePlatform()) {
    return signInWithGoogleNative()
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Must EXACTLY match an entry in the Supabase Redirect URLs allowlist or
      // the auth code is dropped on the way back. /auth/callback is allowlisted;
      // there's no router, so it just serves index.html and detectSessionInUrl
      // consumes the ?code= param. App.jsx strips the path after sign-in.
      redirectTo: `${window.location.origin}/auth/callback`,
      // ALWAYS show the Google account chooser. signOut() clears only the
      // Supabase session, not Google's own SSO cookie, so without this a
      // re-login silently reuses whatever account is still active at Google —
      // the user can never switch or "disconnect" the account. Same reasoning
      // as the native flow below (which also needs `consent` for a Gmail
      // refresh token; web gets Gmail scopes separately via GIS, so
      // select_account alone is enough here — no forced re-consent each login).
      queryParams: { prompt: 'select_account' },
    }
  })

  if (error) {
    console.error('Error signing in with Google:', error)
    throw error
  }

  return data
}

// Native Google sign-in: open the OAuth flow in the system browser (Chrome
// Custom Tab), where Google allows it, then let Supabase redirect back to the
// app's custom scheme. initNativeAuthDeepLink() catches that redirect and
// exchanges the code for a session. Routing through Supabase's own HTTPS
// callback means Google never sees the custom scheme, so no Android OAuth
// client / SHA-1 registration is needed.
async function signInWithGoogleNative() {
  const { Browser } = await import('@capacitor/browser')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: NATIVE_AUTH_REDIRECT,
      // Return the consent URL instead of navigating the webview to it.
      skipBrowserRedirect: true,
      // Request Gmail/Calendar access at login so the provider token can drive
      // the Gmail import natively (GIS can't run in the webview). offline +
      // consent make Google return a refresh token we can store. select_account
      // ALWAYS shows the Google account chooser: signOut() clears only the
      // Supabase session, not the system browser's Google session, so without
      // this a re-login silently reuses whatever account is active there — which
      // is how a device ended up synced to the wrong account (empty dataset).
      scopes: NATIVE_GOOGLE_SCOPES,
      queryParams: { access_type: 'offline', prompt: 'select_account consent' },
    },
  })

  if (error) {
    console.error('Error starting native Google sign-in:', error)
    throw error
  }

  if (data?.url) {
    await Browser.open({ url: data.url })
  }
  return data
}

// Register the deep-link listener that completes native OAuth. Call once at
// startup (main.jsx). No-op on the web build.
export function initNativeAuthDeepLink() {
  if (!Capacitor.isNativePlatform()) return

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.includes('auth-callback')) return

      // Parse the code/error out of the deep link. The WHATWG URL parser is
      // unreliable for custom schemes, so read the query string directly.
      const query = url.split('?')[1]?.split('#')[0] || ''
      const params = new URLSearchParams(query)
      const code = params.get('code')
      const errorDescription = params.get('error_description') || params.get('error')

      try {
        const { Browser } = await import('@capacitor/browser')
        Browser.close().catch(() => {})
      } catch { /* browser may already be closed */ }

      if (errorDescription) {
        console.error('Native Google sign-in was cancelled or failed:', errorDescription)
        return
      }
      if (!code) return

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('Failed to exchange auth code for session:', error)
        return
      }

      // The Google access/refresh token comes back on the session only right
      // after sign-in (Supabase doesn't persist it). Hand it to the Gmail
      // service so the native import can use it. Dynamic import avoids a static
      // circular dependency (gmail.js imports this module).
      const providerToken = data?.session?.provider_token
      const providerRefreshToken = data?.session?.provider_refresh_token
      if (providerToken) {
        try {
          const gmail = await import('./gmail.js')
          await gmail.adoptGoogleAccount(providerToken, providerRefreshToken)
        } catch (e) {
          console.error('Failed to adopt Google token for Gmail import:', e)
        }
      }
    })
  })
}

// Tie the token-refresh timer to the app's foreground state. Supabase's mobile
// guidance: the refresh scheduler must be started/stopped with the app lifecycle,
// or it drifts across background→resume on native and the session can be dropped
// (→ the user is bounced back to the login screen). No-op on the web build.
export function initNativeAuthLifecycle() {
  if (!Capacitor.isNativePlatform()) return
  try { supabase.auth.startAutoRefresh() } catch { /* ignore */ }
  import('@capacitor/app').then(({ App }) => {
    App.addListener('appStateChange', ({ isActive }) => {
      try {
        if (isActive) supabase.auth.startAutoRefresh()
        else supabase.auth.stopAutoRefresh()
      } catch { /* ignore */ }
    })
  }).catch(() => { /* @capacitor/app unavailable — nothing to tie to */ })
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error)
    throw error
  }
}

// Listen to auth state changes
export function onAuthStateChange(callback) {
  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })

  return subscription
}

// Refresh session
export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession()
  if (error) {
    console.error('Error refreshing session:', error)
    return null
  }
  return data
}

export function isSupabaseConfigured() {
  return !!supabaseUrl && !!supabaseAnonKey
}

export default supabase
