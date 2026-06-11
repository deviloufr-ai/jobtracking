import { useMigration } from './hooks/useMigration'
import { usePolling } from './hooks/usePolling'
import { MigrationDialog } from './components/MigrationDialog'
import App from './App'

export default function Root() {
  // App handles its own landing page + auth flow via Gmail integration
  // No need for separate auth check here

  // Note: migration and polling require a user ID, but they'll gracefully handle null
  const migration = useMigration(null)
  const polling = usePolling(null)

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
