import { supabase, isSupabaseConfigured } from './supabase'
import { indexeddb } from './indexeddb'
import { convertHistoryFromSupabase, snakeToCamel, deserializeJobFields } from './fieldConversion'
import { isDeletedJobId, deduplicateHistory } from '../hooks/useJobs'

const POLL_INTERVAL = 300000 // 5 minutes

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

  // Perform one poll cycle
  async poll(userId) {
    if (!isSupabaseConfigured()) {
      console.warn('⚠ Supabase not configured, skipping poll')
      return
    }

    if (!navigator.onLine || !userId) {
      console.log('⚠ Offline or no userId, skipping poll')
      return
    }

    // Load lastSyncTime from IndexedDB if not already set
    if (!this.lastSyncTime && userId) {
      try {
        const stored = await indexeddb.getMetadata('last_sync_time')
        if (stored) this.lastSyncTime = stored
      } catch (err) {
        console.warn('Failed to load lastSyncTime from storage:', err.message)
      }
    }

    let hasChanges = false

    try {
      console.log('📡 Polling Supabase for user:', userId)
      this.notifyListeners({ status: 'polling' })

      // Fetch jobs changed since last sync
      const jobsQuery = supabase
        .from('jobs')
        .select('*')
        .eq('user_id', userId)

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

      console.log('✓ Fetched', changedJobs?.length || 0, 'jobs from Supabase')

      // Fetch job history only for changed jobs (batch query, not N+1)
      const historyByJobId = new Map()
      if (changedJobs && changedJobs.length > 0) {
        const jobIds = changedJobs.map(j => j.id)
        const { data: allHistory, error: historyError } = await supabase
          .from('job_history')
          .select('*')
          .in('job_id', jobIds)
          .order('date', { ascending: true })

        if (historyError) {
          console.error('Poll error fetching history:', historyError)
        } else if (allHistory) {
          // Group history by job ID and deduplicate by date+status
          const historyByJob = new Map()
          for (const entry of allHistory) {
            if (!historyByJob.has(entry.job_id)) {
              historyByJob.set(entry.job_id, [])
            }
            historyByJob.get(entry.job_id).push(entry)
          }

          // Convert and deduplicate each job's history
          for (const [jobId, jobHistory] of historyByJob) {
            const seen = new Set()
            const deduped = []
            for (const entry of jobHistory) {
              const converted = convertHistoryFromSupabase(entry)
              const key = `${converted.date}_${converted.status}`
              if (!seen.has(key)) {
                seen.add(key)
                deduped.push(converted)
              }
            }
            historyByJobId.set(jobId, deduped)
          }
        }
      }

      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (settingsError) {
        console.error('Poll error fetching settings:', settingsError)
        // Don't fail the whole poll for settings error
      }

      // Fetch CVs
      const { data: cvs, error: cvsError } = await supabase
        .from('cvs')
        .select('*')
        .eq('user_id', userId)

      if (cvsError) {
        console.error('Poll error fetching CVs:', cvsError)
        // Don't fail for CV errors
      }

      // Merge into local cache
      if (changedJobs && changedJobs.length > 0) {
        hasChanges = true
        for (const job of changedJobs) {
          // Skip jobs that were explicitly deleted locally
          if (isDeletedJobId(job.id)) {
            console.log('⏭️  Skipped deleted job ID (poll):', job.id)
            continue
          }

          // Convert from snake_case to camelCase
          const jobInCamel = snakeToCamel(job)
          // Deserialize JSON fields (positionLinks, positionChecks)
          const jobDeserialized = deserializeJobFields(jobInCamel)
          // Attach history to job
          const jobWithHistory = {
            ...jobDeserialized,
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
        const settingsInCamel = snakeToCamel(settingsData)
        const localSettings = await indexeddb.getSettings()
        const merged = this.mergeSettings(localSettings, settingsInCamel)
        await indexeddb.saveSettings(merged)
      }

      if (cvs && cvs.length > 0) {
        hasChanges = true
        for (const cv of cvs) {
          const cvInCamel = snakeToCamel(cv)
          await indexeddb.saveCV(cvInCamel)
        }
      }

      // Update last sync time
      const now = new Date().toISOString()
      this.lastSyncTime = now
      await indexeddb.setMetadata('last_sync_time', now)

      // Emit event when sync completes (with or without changes)
      console.log('✓ Dispatching sync completion event')
      window.dispatchEvent(new CustomEvent('jobtrackr:datasync', { detail: { jobsCount: changedJobs?.length || 0, hasChanges } }))

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

  snakeToCamel(obj) {
    if (!obj || typeof obj !== 'object') return obj
    const camel = {}
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
      // Handle special cases
      if (camelKey === 'gmailIds' && typeof value === 'string') {
        try {
          camel[camelKey] = JSON.parse(value)
        } catch {
          camel[camelKey] = value
        }
      } else {
        camel[camelKey] = value
      }
    }
    return camel
  }

  mergeJob(local, remote) {
    // Convert remote snake_case fields to camelCase
    const remoteConverted = this.snakeToCamel(remote)

    // Last-write-wins on timestamp
    const localTime = local.updated_at ? new Date(local.updated_at).getTime() : 0
    const remoteTime = remoteConverted.updated_at ? new Date(remoteConverted.updated_at).getTime() : 0

    if (localTime > remoteTime) {
      // Local is newer, keep it but add any new remote history
      if (local.history && Array.isArray(local.history) && remoteConverted.history && Array.isArray(remoteConverted.history)) {
        const merged = [...local.history, ...remoteConverted.history]
        const deduplicated = deduplicateHistory([{ history: merged }])[0].history
        return { ...local, history: deduplicated }
      }
      return local
    }

    // Remote is newer, but merge histories to preserve local entries not yet synced
    if (remoteConverted.history && Array.isArray(remoteConverted.history) && local.history && Array.isArray(local.history)) {
      const merged = [...remoteConverted.history, ...local.history]
      const deduplicated = deduplicateHistory([{ history: merged }])[0].history
      return { ...remoteConverted, history: deduplicated }
    }

    return remoteConverted
  }

  mergeSettings(local, remote) {
    // Settings: remote always wins (single canonical version)
    return remote
  }
}

export const pollManager = new PollManager()
