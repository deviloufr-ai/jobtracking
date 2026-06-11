import { useAuth } from '../../hooks/useAuth'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const { signInWithGoogle, loading, error, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  // Redirect to app if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/')
    }
  }, [isAuthenticated, navigate])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('Google sign-in failed:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">JobTrackr</h1>
            <p className="text-gray-600">Multi-device job application tracker</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>

          {/* Info Text */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-center text-gray-600 text-sm">
              Sign in with your Google account to get started. Your job applications and settings will sync across all your devices.
            </p>
          </div>

          {/* Features */}
          <div className="mt-8 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-indigo-600 mt-0.5">✓</div>
              <p className="text-sm text-gray-700">Sync across all devices</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-indigo-600 mt-0.5">✓</div>
              <p className="text-sm text-gray-700">Work offline, sync when ready</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-indigo-600 mt-0.5">✓</div>
              <p className="text-sm text-gray-700">Gmail integration for job tracking</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-8">
          By signing in, you agree to our data usage policies.
        </p>
      </div>
    </div>
  )
}
