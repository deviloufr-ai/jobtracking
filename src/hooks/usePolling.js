import { useEffect, useState } from 'react'
import { getSyncCoordinator } from '../services/syncCoordinator'

export function usePolling(userId) {
  const [pollStatus, setPollStatus] = useState({
    status: 'synced',
    jobsCount: 0,
    timestamp: null,
    error: null
  })

  useEffect(() => {
    if (!userId) {
      return
    }

    // Subscribe to coordinator status updates
    const coordinator = getSyncCoordinator()
    if (!coordinator) {
      console.warn('SyncCoordinator not initialized')
      return
    }

    const unsubscribe = coordinator.onStatusChange(data => {
      setPollStatus(prev => ({
        ...prev,
        ...data,
        timestamp: new Date()
      }))
    })

    // Cleanup on unmount or userId change
    return () => {
      unsubscribe()
    }
  }, [userId])

  return pollStatus
}
