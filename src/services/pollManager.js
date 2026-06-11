import { supabase, isSupabaseConfigured } from './supabase'
import { indexeddb } from './indexeddb'

const POLL_INTERVAL = 900000 // 15 minutes

class PollManager {
  constructor() {
    this.isPolling = false
    this.pollTimer = null
    this.listeners = []
    this.userId = null
    this.lastSyncTime = null
  }

  addListener(callback) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  notifyListeners(data) {
    this.listeners.forEach(listener => listener(data))
  }

  // Start polling
  async start(userId) {
    if (this.isPolling) return

    this.userId = userId
    this.isPolling = true

    // Get last sync time from metadata
    this.lastSyncTime = await indexeddb.getMetadata('last_sync_time')

    // Run first poll immediately
    await this.poll()

    // Then set up interval
    this.pollTimer = setInterval(() => {
      this.poll()
    }, POLL_INTERVAL)
  }

  // Stop polling
  stop() {
    this.isPolling = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  // Perform one poll cycle
  async poll() {
    if (!isSupabaseConfigured()) {
      return
    }

    if (!navigator.onLine || !this.userId) {
      return
    }

    let hasChanges = false

    try {
      this.notifyListeners({ status: 'polling' })

      // Fetch jobs changed since last sync
      const jobsQuery = supabase
        .from('jobs')
        .select('*')
        .eq('user_id', this.userId)

      // If we have a last sync time, only fetch changes
      if (this.lastSyncTime) {
        jobsQuery.gt('updated_at', this.lastSyncTime)
      }

      const { data: changedJobs, error: jobsError } = await jobsQuery

      if (jobsError) {
        console.error('Poll error fetching jobs:', jobsError)
        this.notifyListeners({ status: 'error', error: jobsError.message })
        return
      }

      // Fetch job history for all user jobs
      const { data: allHistory, error: historyError } = await supabase
        .from('job_history')
        .select('*')
        .eq('user_id', this.userId)

      if (historyError) {
        console.error('Poll error fetching history:', historyError)
        // Don't fail for history errors
      }

      // Map history by job_id
      const historyByJobId = new Map()
      if (allHistory) {
        allHistory.forEach(entry => {
          if (!historyByJobId.has(entry.job_id)) {
            historyByJobId.set(entry.job_id, [])
          }
          historyByJobId.get(entry.job_id).push(entry)
        })
      }

      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', this.userId)
        .single()

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Poll error fetching settings:', settingsError)
        // Don't fail the whole poll for settings error
      }

      // Fetch CVs
      const { data: cvs, error: cvsError } = await supabase
        .from('cvs')
        .select('*')
        .eq('user_id', this.userId)

      if (cvsError) {
        console.error('Poll error fetching CVs:', cvsError)
        // Don't fail for CV errors
      }

      // Merge into local cache
      if (changedJobs && changedJobs.length > 0) {
        hasChanges = true
        for (const job of changedJobs) {
          // Attach history to job
          const jobWithHistory = {
            ...job,
            history: historyByJobId.get(job.id) || []
          }

          const localJob = await indexeddb.getJob(job.id)

          if (!localJob) {
            // New job, just save it
            await indexeddb.saveJob(jobWithHistory)
          } else {
            // Merge local and remote
            const merged = this.mergeJob(localJob, jobWithHistory)
            await indexeddb.saveJob(merged)
          }
        }
      }

      if (settingsData) {
        hasChanges = true
        const localSettings = await indexeddb.getSettings()
        const merged = this.mergeSettings(localSettings, settingsData)
        await indexeddb.saveSettings(merged)
      }

      if (cvs && cvs.length > 0) {
        hasChanges = true
        for (const cv of cvs) {
          await indexeddb.saveCV(cv)
        }
      }

      // Update last sync time
      const now = new Date().toISOString()
      this.lastSyncTime = now
      await indexeddb.setMetadata('last_sync_time', now)

      // Emit event if data changed so useJobs reloads
      if (hasChanges) {
        window.dispatchEvent(new CustomEvent('jobtrackr:datasync', { detail: { jobsCount: changedJobs?.length || 0 } }))
      }

      this.notifyListeners({
        status: 'success',
        jobsCount: changedJobs?.length || 0,
        timestamp: new Date()
      })
    } catch (err) {
      console.error('Poll error:', err)
      this.notifyListeners({ status: 'error', error: err.message })
    }
  }

  mergeJob(local, remote) {
    // Last-write-wins on timestamp
    if (!local.last_modified_at || !remote.last_modified_at) {
      return remote
    }

    const localTime = new Date(local.last_modified_at).getTime()
    const remoteTime = new Date(remote.last_modified_at).getTime()

    if (localTime > remoteTime) {
      return local
    }

    // Remote is newer, but merge histories
    if (local.history && Array.isArray(local.history)) {
      const remoteHistory = remote.history || []
      const localHistory = local.history

      const merged = [...remoteHistory]
      localHistory.forEach(entry => {
        const exists = merged.some(
          h => h.date === entry.date && h.status === entry.status
        )
        if (!exists) {
          merged.push(entry)
        }
      })

      return { ...remote, history: merged }
    }

    return remote
  }

  mergeSettings(local, remote) {
    // Settings: remote always wins (single canonical version)
    return remote
  }
}

export const pollManager = new PollManager()
