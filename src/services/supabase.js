import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Custom URL scheme the native app registers (see AndroidManifest.xml). Google
// blocks OAuth inside the webview, so on native we open the flow in the system
// browser and Supabase redirects back here as a deep link.
const NATIVE_AUTH_REDIRECT = 'com.smartjobtracker.app://auth-callback'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
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
supabase.auth.onAuthStateChange((_event, session) => { cachedAuthUserId = session?.user?.id || null })

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

      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('Failed to exchange auth code for session:', error)
      }
    })
  })
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
