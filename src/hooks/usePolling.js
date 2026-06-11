import { useEffect, useState } from 'react'
import { pollManager } from '../services/pollManager'

export function usePolling(userId) {
  const [pollStatus, setPollStatus] = useState({
    status: 'idle',
    jobsCount: 0,
    timestamp: null,
    error: null
  })

  useEffect(() => {
    if (!userId) {
      pollManager.stop()
      return
    }

    // Start polling
    pollManager.start(userId)

    // Listen for poll updates
    const unsubscribe = pollManager.addListener(data => {
      setPollStatus(prev => ({
        ...prev,
        ...data
      }))
    })

    // Cleanup on unmount or userId change
    return () => {
      unsubscribe()
      pollManager.stop()
    }
  }, [userId])

  return pollStatus
}
