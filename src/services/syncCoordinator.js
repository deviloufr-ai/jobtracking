import { syncManager } from './syncManager'
import { pollManager } from './pollManager'
import { indexeddb } from './indexeddb'
import { isSupabaseConfigured } from './supabase'

const POLL_INTERVAL = 10000 // 10 seconds

class SyncCoordinator {
  constructor(userId) {
    this.userId = userId // Stable UUID, never changes
    this.isOnline = navigator.onLine
    this.pollTimer = null
    this.isPolling = false
    this.listeners = []

    // Listen to online/offline events
    window.addEventListener('online', () => this.handleOnline())
    window.addEventListener('offline', () => this.handleOffline())

    // Listen to datasync events from pollManager
    window.addEventListener('jobtrackr:datasync', () => {
      this.notifyListeners({ status: 'synced', timestamp: new Date() })
    })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ────────────────────────────────────────────────────────────────────────────

  async initialize() {
    if (!this.userId) {
      console.warn('⚠ No userId provided to SyncCoordinator, skipping initialization')
      return
    }

    console.log('🔄 Initializing SyncCoordinator with user ID:', this.userId)

    try {
      // Initialize IndexedDB if needed
      await indexeddb.initialized

      // Start polling immediately and on interval
      await this.doPoll()

      this.pollTimer = setInterval(() => {
        this.doPoll()
      }, POLL_INTERVAL)

      this.isPolling = true
      this.notifyListeners({ status: 'synced' })
    } catch (err) {
      console.error('Failed to initialize SyncCoordinator:', err)
      this.notifyListeners({ status: 'error', error: err.message })
    }
  }

  async shutdown() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.isPolling = false
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Mutation API (used by useJobs)
  // ────────────────────────────────────────────────────────────────────────────

  async mutate(table, type, record) {
    if (!this.userId) {
      console.error('Cannot mutate: no userId in coordinator')
      throw new Error('No userId configured')
    }

    return syncManager.mutate(this.userId, table, type, record)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Polling
  // ────────────────────────────────────────────────────────────────────────────

  async doPoll() {
    if (!this.userId || !this.isOnline) {
      return
    }

    return pollManager.poll(this.userId)
  }

  // Manual poll trigger
  async poll() {
    return this.doPoll()
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Offline/Online Handling
  // ────────────────────────────────────────────────────────────────────────────

  handleOnline() {
    this.isOnline = true
    console.log('📡 Device online')
    this.notifyListeners({ status: 'syncing' })

    // Flush any queued mutations
    syncManager.flushQueue(this.userId)

    // Trigger a poll
    this.doPoll()
  }

  handleOffline() {
    this.isOnline = false
    console.log('📴 Device offline')
    this.notifyListeners({ status: 'offline' })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Status Subscription
  // ────────────────────────────────────────────────────────────────────────────

  onStatusChange(callback) {
    this.listeners.push(callback)
    // Call immediately with current status
    callback({ status: this.isOnline ? 'synced' : 'offline' })
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  notifyListeners(data) {
    this.listeners.forEach(listener => {
      try {
        listener(data)
      } catch (err) {
        console.error('Error in sync listener:', err)
      }
    })
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      isPolling: this.isPolling,
      userId: this.userId
    }
  }
}

// Global singleton
let coordinator = null

export function initializeSyncCoordinator(userId) {
  if (coordinator) {
    console.warn('SyncCoordinator already initialized')
    return coordinator
  }

  coordinator = new SyncCoordinator(userId)
  // Initialize asynchronously but don't block on it
  coordinator.initialize().catch(err => {
    console.error('Failed to initialize SyncCoordinator:', err)
  })
  return coordinator
}

export function getSyncCoordinator() {
  return coordinator
}

export { SyncCoordinator }
