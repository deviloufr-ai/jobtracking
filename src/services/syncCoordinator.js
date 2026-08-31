import { syncManager } from './syncManager'
import { pollManager } from './pollManager'
import { indexeddb } from './indexeddb'
import { isSupabaseConfigured } from './supabase'
import { pushAllCVs } from './cvSync'
import { pullProfile, pushProfile, loadLocalProfile } from './profileSync'

const POLL_INTERVAL = 300000 // 5 minutes

class SyncCoordinator {
  constructor(userId) {
    this.userId = userId // Stable UUID, never changes
    this.isOnline = navigator.onLine
    this.pollTimer = null
    this.isPolling = false
    this.listeners = []

    // Bind handlers so we can remove them later
    this.handleOnlineBinding = () => this.handleOnline()
    this.handleOfflineBinding = () => this.handleOffline()
    this.handleDatasyncBinding = () => {
      this.notifyListeners({ status: 'synced', timestamp: new Date() })
    }

    // Listen to online/offline events
    window.addEventListener('online', this.handleOnlineBinding)
    window.addEventListener('offline', this.handleOfflineBinding)

    // Listen to datasync events from pollManager
    window.addEventListener('jobtrackr:datasync', this.handleDatasyncBinding)
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

      // First poll = FULL fetch+merge of remote into the local cache (parity
      // with the retired legacy syncLocalJobsToSupabase fetch half).
      await this.doPoll({ fullSync: true })

      // Then one-time bulk upload of any local-only jobs (created while the
      // coordinator wasn't ready, imported offline, or pre-existing legacy data).
      // This replaces the legacy upload half. Poll above already merged remote
      // into local, so local history is the superset before we push.
      try {
        const localJobs = await indexeddb.getAllJobs()
        if (localJobs?.length) {
          await syncManager.pushAllJobs(this.userId, localJobs)
          // Let useJobs reload the merged result.
          window.dispatchEvent(new CustomEvent('jobtrackr:datasync', { detail: { source: 'initial-upload' } }))
        }
      } catch (err) {
        console.warn('Initial bulk upload failed (non-critical):', err.message)
      }

      // Base CVs: upload any local-only CVs (the poll above already downloaded
      // remote ones into IndexedDB). Idempotent upsert on id.
      try {
        await pushAllCVs(this.userId)
      } catch (err) {
        console.warn('CV bulk upload failed (non-critical):', err.message)
      }

      // Profile: remote wins if present (hydrates a fresh device); otherwise push
      // this device's local profile + portable prefs (CV picture, CV-gen settings,
      // dismissed actions) up so they become the canonical copy. pushProfile
      // re-reads the portable prefs and no-ops when there's genuinely nothing.
      try {
        const remoteProfile = await pullProfile(this.userId)
        if (!remoteProfile) {
          await pushProfile(loadLocalProfile() || {})
        }
      } catch (err) {
        console.warn('Profile sync failed (non-critical):', err.message)
      }

      // Subsequent polls are incremental.
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

    // Remove event listeners to prevent memory leaks
    window.removeEventListener('online', this.handleOnlineBinding)
    window.removeEventListener('offline', this.handleOfflineBinding)
    window.removeEventListener('jobtrackr:datasync', this.handleDatasyncBinding)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Mutation API (used by useJobs)
  // ────────────────────────────────────────────────────────────────────────────

  async mutate(table, type, record, options = {}) {
    if (!this.userId) {
      console.error('Cannot mutate: no userId in coordinator')
      throw new Error('No userId configured')
    }

    return syncManager.mutate(this.userId, table, type, record, options)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Polling
  // ────────────────────────────────────────────────────────────────────────────

  async doPoll(options = {}) {
    if (!this.userId || !this.isOnline) {
      return
    }

    return pollManager.poll(this.userId, options)
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

// Re-point the coordinator at a different user ID. Used when the canonical sync
// UUID is corrected after init (e.g. a fresh incognito session reconciles onto
// the Gmail account's existing UUID). Tears down the old coordinator's timer and
// listeners and starts a fresh full sync under the new ID.
export function reinitializeSyncCoordinator(userId) {
  if (coordinator && coordinator.userId === userId) {
    return coordinator
  }

  if (coordinator) {
    console.log('🔁 Re-pointing SyncCoordinator to user ID:', userId)
    coordinator.shutdown()
    coordinator = null
  }

  return initializeSyncCoordinator(userId)
}

export function getSyncCoordinator() {
  return coordinator
}

export { SyncCoordinator }
