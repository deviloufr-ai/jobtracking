import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    // Persist the session across reloads and refresh tokens automatically.
    persistSession: true,
    autoRefreshToken: true,
    // Detect & consume the OAuth redirect (?code=… / #access_token=…) on load so
    // the Google sign-in callback works without a dedicated router/route.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

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
