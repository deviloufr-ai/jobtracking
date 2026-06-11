import { useState, useEffect } from 'react'
import { syncManager } from '../services/syncManager'

export function useSyncStatus() {
  const [status, setStatus] = useState({
    isOnline: navigator.onLine,
    isSyncing: false,
    queueSize: 0,
    lastSync: null,
    error: null
  })

  useEffect(() => {
    // Get initial queue size
    syncManager.getQueueSize().then(size => {
      setStatus(prev => ({ ...prev, queueSize: size }))
    })

    // Listen for status changes
    const unsubscribe = syncManager.onStatusChange(newStatus => {
      setStatus(prev => ({
        ...prev,
        ...newStatus,
        isOnline: newStatus.status === 'online' || prev.isOnline,
        isSyncing: newStatus.status === 'syncing',
        lastSync: newStatus.status === 'synced' ? new Date() : prev.lastSync,
        error: newStatus.error || null
      }))
    })

    return () => unsubscribe()
  }, [])

  return status
}
