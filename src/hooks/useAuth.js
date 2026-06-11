import { useState, useEffect, useCallback } from 'react'
import {
  signInWithGoogle,
  signOut,
  getCurrentUser,
  getSession,
  onAuthStateChange,
  refreshSession
} from '../services/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Check if user is already logged in
  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true)
        const currentUser = await getCurrentUser()
        const currentSession = await getSession()

        setUser(currentUser)
        setSession(currentSession)
      } catch (err) {
        console.error('Auth init error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  // Listen to auth state changes (handles OAuth callbacks, token refresh, etc.)
  useEffect(() => {
    const subscription = onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user || null)

      // Refresh token if needed
      if (event === 'TOKEN_REFRESHED') {
        console.log('Auth token refreshed')
      }

      // Handle sign out
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setSession(null)
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const handleSignInWithGoogle = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      await signInWithGoogle()
      // Note: User will be redirected or session updated via listener
    } catch (err) {
      console.error('Sign in error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      await signOut()
      setUser(null)
      setSession(null)
    } catch (err) {
      console.error('Sign out error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefreshSession = useCallback(async () => {
    try {
      setError(null)
      const data = await refreshSession()
      if (data) {
        setSession(data.session)
        setUser(data.session?.user || null)
      }
    } catch (err) {
      console.error('Refresh session error:', err)
      setError(err.message)
    }
  }, [])

  return {
    user,
    session,
    loading,
    error,
    isAuthenticated: !!user,
    signInWithGoogle: handleSignInWithGoogle,
    signOut: handleSignOut,
    refreshSession: handleRefreshSession
  }
}
