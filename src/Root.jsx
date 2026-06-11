import { useAuth } from './hooks/useAuth'
import { useMigration } from './hooks/useMigration'
import { usePolling } from './hooks/usePolling'
import { LoginPage } from './components/Auth/LoginPage'
import { MigrationDialog } from './components/MigrationDialog'
import App from './App'

export default function Root() {
  const { user, loading, isAuthenticated } = useAuth()
  const migration = useMigration(user?.id)
  const polling = usePolling(user?.id)

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />
  }

  // Show main app if authenticated
  return (
    <>
      <MigrationDialog
        status={migration.status}
        progress={migration.progress}
        message={migration.message}
        error={migration.error}
      />
      <App />
    </>
  )
}
