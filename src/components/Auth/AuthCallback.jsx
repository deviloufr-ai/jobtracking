import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabase'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Handle OAuth callback - Supabase auth state will be updated automatically
    // by the onAuthStateChange listener in useAuth hook
    // Just redirect to home after a brief delay to allow state to update
    const timer = setTimeout(() => {
      navigate('/')
    }, 1000)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  )
}
