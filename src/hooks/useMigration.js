import { useState, useCallback, useEffect } from 'react'
import { performMigration } from '../services/migration'

export function useMigration(userId) {
  const [migrationState, setMigrationState] = useState({
    status: 'idle', // idle | in_progress | success | error
    progress: 0,
    message: '',
    error: null,
    result: null
  })

  const runMigration = useCallback(async () => {
    if (!userId) return

    setMigrationState({
      status: 'in_progress',
      progress: 0,
      message: 'Checking for existing data...',
      error: null,
      result: null
    })

    try {
      const result = await performMigration(userId, (message, progress, isError) => {
        setMigrationState(prev => ({
          ...prev,
          message,
          progress,
          status: isError ? 'error' : 'in_progress'
        }))
      })

      setMigrationState(prev => ({
        ...prev,
        status: 'success',
        progress: 100,
        message: result.skipped ? 'Already migrated' : 'Migration complete!',
        result
      }))

      return result
    } catch (err) {
      setMigrationState(prev => ({
        ...prev,
        status: 'error',
        error: err.message,
        message: `Migration failed: ${err.message}`
      }))

      throw err
    }
  }, [userId])

  // Auto-run migration on component mount if userId is available
  useEffect(() => {
    if (userId && migrationState.status === 'idle') {
      runMigration()
    }
  }, [userId])

  return {
    ...migrationState,
    runMigration,
    reset: () =>
      setMigrationState({
        status: 'idle',
        progress: 0,
        message: '',
        error: null,
        result: null
      })
  }
}
