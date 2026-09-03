import { supabase, isSupabaseConfigured } from './supabase'
import { indexeddb } from './indexeddb'
import { convertHistoryFromSupabase, snakeToCamel, deserializeJobFields } from './fieldConversion'
import { isDeletedJobId, deduplicateHistory, filterDeletedHistory, historyEntryKey, markJobIdAsDeletedLocal, markHistoryEntryKeysDeletedLocal, partitionJobsByTombstones, deriveStatusFromHistory } from '../hooks/useJobs'
import { flushPendingTombstones, fetchRemoteTombstones, flushPendingHistoryTombstones, fetchRemoteHistoryTombstones } from './tombstoneService'
import { getFlag, FLAGS } from './featureFlags'

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

  // Perform one poll cycle. Pass { fullSync: true } to ignore lastSyncTime and
  // fetch ALL of the user's jobs (used for the coordinator's first poll, giving
  // parity with the retired legacy full-fetch).
  async poll(userId, { fullSync = false } = {}) {
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

      // Apply cross-device deletions FIRST, so the merge loop below skips any job
      // that was deleted on another device (deletion wins over a concurrent edit).
      const removedAny = await this.applyRemoteTombstones(userId, fullSync)
      if (removedAny) hasChanges = true

      // Pull cross-device history-ENTRY deletions into the local tombstone set BEFORE
      // the merge loop, so filterDeletedHistory (in mergeJob) drops them and the
      // additive merge can't resurrect an entry another device deleted (migration 013).
      await this.applyRemoteHistoryTombstones(userId, fullSync)

      // Fetch jobs changed since last sync
      const jobsQuery = supabase
        .from('jobs')
        .select('*')
        .eq('user_id', userId)

      // If we have a last sync time, only fetch changes (unless a full sync is requested)
      if (this.lastSyncTime && !fullSync) {
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

          // Convert and deduplicate each job's history using the canonical entry
          // key (gmailId-first), matching the push key in syncManager and every
          // other dedup/tombstone path. Also drop tombstoned entries here so a
          // remote copy of a locally-deleted entry never re-enters the cache.
          for (const [jobId, jobHistory] of historyByJob) {
            const seen = new Set()
            const deduped = []
            for (const entry of jobHistory) {
              const converted = convertHistoryFromSupabase(entry)
              const key = historyEntryKey(converted)
              if (!seen.has(key)) {
                seen.add(key)
                deduped.push(converted)
              }
            }
            historyByJobId.set(jobId, filterDeletedHistory(jobId, deduped))
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
          // Unbundle the `extras` jsonb blob (generated CV, letter, score,
          // interview sessions…) back into top-level fields. Kept as-is (not
          // run through snakeToCamel) so nested keys like `hire_decision` survive.
          const { extras, ...jobBase } = jobDeserialized
          const jobWithExtras = (extras && typeof extras === 'object' && !Array.isArray(extras))
            ? { ...jobBase, ...extras }
            : jobBase
          // Attach history to job
          const jobWithHistory = {
            ...jobWithExtras,
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
        // Also mirror to localStorage (the store `loadSettings()` reads for the
        // automation rules) and notify open hooks, so a settings change made on
        // another device takes effect LIVE — without a page reload. Previously the
        // poll wrote only IndexedDB, leaving the Settings UI and automation logic
        // stale until the tab was reloaded. Guarded on an actual diff to avoid a
        // needless re-render every poll cycle.
        try {
          const mergedStr = JSON.stringify(merged)
          if (localStorage.getItem('jobtrackr_settings') !== mergedStr) {
            localStorage.setItem('jobtrackr_settings', mergedStr)
            window.dispatchEvent(new CustomEvent('jobtrackr-settings-changed', { detail: merged }))
          }
        } catch {}
      }

      if (cvs && cvs.length > 0) {
        hasChanges = true
        for (const cv of cvs) {
          const cvInCamel = snakeToCamel(cv)
          // Supabase stores CV text in `content_raw`; the app reads `text`.
          await indexeddb.saveCV({
            ...cvInCamel,
            text: cvInCamel.text || cvInCamel.contentRaw || '',
          })
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

  // Cross-device deletions: remove any local job that another device tombstoned
  // in `deleted_jobs`. A job is removed ONLY when its id is explicitly present in
  // the user's own tombstone table (never inferred from absence), so an unsynced
  // local job can't be dropped. The destructive half is behind a kill-switch flag.
  // Returns true when at least one local job was removed. See plan High #2.
  async applyRemoteTombstones(userId, fullSync) {
    try {
      // Always drain the producer queue — writing tombstones deletes nothing locally.
      await flushPendingTombstones(userId)

      // Consumer (the destructive half) is gated; when disabled, don't advance the
      // watermark either, so a re-enable still catches up on missed tombstones.
      if (getFlag(FLAGS.CROSS_DEVICE_DELETE_OFF)) return false

      const since = fullSync ? null : await indexeddb.getMetadata('last_tombstone_sync')
      const tombstones = await fetchRemoteTombstones(userId, since)
      if (!tombstones.length) return false

      const ids = tombstones.map(t => t.job_id).filter(Boolean)

      // Mark every id locally (local-only, no re-enqueue) so the same poll's merge
      // loop skips a concurrently-fetched edit of a deleted job.
      for (const id of ids) markJobIdAsDeletedLocal(id)

      const localJobs = await indexeddb.getAllJobs()
      const { removed } = partitionJobsByTombstones(localJobs, ids)
      for (const job of removed) {
        await indexeddb.deleteJob(job.id)
      }

      // Advance the watermark to the newest tombstone applied this cycle.
      const maxDeletedAt = tombstones.reduce((m, t) =>
        (!m || new Date(t.deleted_at) > new Date(m)) ? t.deleted_at : m, null)
      if (maxDeletedAt) await indexeddb.setMetadata('last_tombstone_sync', maxDeletedAt)

      if (removed.length) {
        console.log(`🗑️ Cross-device: removed ${removed.length} locally-tombstoned job(s)`)
        return true
      }
      return false
    } catch (err) {
      console.warn('applyRemoteTombstones failed (non-critical):', err?.message)
      return false
    }
  }

  // Pull the user's history-entry tombstones (deletions of individual timeline
  // entries made on other devices) into this device's local tombstone set, so the
  // additive history merge drops them. Fully graceful: if migration 013 hasn't been
  // applied, the fetch returns [] and this is a no-op. See tombstoneService.
  async applyRemoteHistoryTombstones(userId, fullSync) {
    try {
      // Drain the producer queue (offline/failed writes) regardless.
      await flushPendingHistoryTombstones(userId)

      const since = fullSync ? null : await indexeddb.getMetadata('last_history_tombstone_sync')
      const tombs = await fetchRemoteHistoryTombstones(userId, since)
      if (!tombs.length) return

      markHistoryEntryKeysDeletedLocal(tombs.map(t => `${t.job_id}::${t.entry_key}`))

      const maxDeletedAt = tombs.reduce((m, t) =>
        (!m || new Date(t.deleted_at) > new Date(m)) ? t.deleted_at : m, null)
      if (maxDeletedAt) await indexeddb.setMetadata('last_history_tombstone_sync', maxDeletedAt)
    } catch (err) {
      console.warn('applyRemoteHistoryTombstones failed (non-critical):', err?.message)
    }
  }

  mergeJob(local, remote) {
    // Convert remote snake_case fields to camelCase (shared util in fieldConversion)
    const remoteConverted = snakeToCamel(remote)

    // Scalar fields: last-write-wins on timestamp. Local wins ties (>=) so a
    // device's own just-made edit isn't clobbered by Supabase's server timestamp.
    const localTime = local.updated_at ? new Date(local.updated_at).getTime() : 0
    const remoteTime = remoteConverted.updated_at ? new Date(remoteConverted.updated_at).getTime() : 0
    // Field-level union: the newer side wins on any shared key, but keys the winner
    // doesn't carry survive from the loser. This stops a remote-wins poll from
    // silently wiping local-only fields the remote row lacks (e.g. enrichedAt/sentAt
    // from an older client, or any not-yet-synced local field).
    const [winner, loser] = localTime >= remoteTime ? [local, remoteConverted] : [remoteConverted, local]
    const base = { ...loser, ...winner }

    // History: ALWAYS additive-merge, regardless of which side won the scalar
    // fields. Returning only the winner's history (the old behaviour) silently
    // dropped a peer device's newly-added entries on concurrent edits.
    // deduplicateHistory is idempotent, so repeated merges don't grow notes.
    // Trade-off: an entry deleted on one device can briefly reappear until that
    // device re-syncs — acceptable vs. permanently losing real timeline entries.
    const localHistory = Array.isArray(local.history) ? local.history : []
    const remoteHistory = Array.isArray(remoteConverted.history) ? remoteConverted.history : []
    if (localHistory.length || remoteHistory.length) {
      // Winner's entries first so its metadata (meetingLink, gmailId…) is kept as primary.
      const ordered = winner === local
        ? [...localHistory, ...remoteHistory]
        : [...remoteHistory, ...localHistory]
      // Drop tombstoned entries BEFORE dedup so a deletion on this device can't be
      // resurrected by a stale remote copy on the next poll.
      const jobId = base.id || local.id || remoteConverted.id
      const cleaned = filterDeletedHistory(jobId, ordered)
      const history = deduplicateHistory([{ history: cleaned }])[0].history

      // Status derives from the LATEST merged timeline entry (canonical
      // latest-entry-wins), not a date-granular "does remote have a strictly-newer
      // entry" heuristic. The old heuristic kept the stale LOCAL status when both
      // devices added a same-day entry, so a same-day reviewing→interview change on
      // one device never propagated to the other.
      const derivedStatus = deriveStatusFromHistory(history)
      return derivedStatus ? { ...base, history, status: derivedStatus } : { ...base, history }
    }

    return base
  }

  mergeSettings(local, remote) {
    // LWW on last_modified_at, with LOCAL winning ties (>), so a not-yet-pushed
    // local change isn't clobbered by an equal/older remote row (the previous
    // unconditional remote-wins caused a visible flip-flop). Keys the winner lacks
    // still survive from the loser — e.g. debugLogsEnabled is never synced (no
    // column), and bare remote-wins used to wipe it every poll.
    const localTime = local?.lastModifiedAt ? new Date(local.lastModifiedAt).getTime() : 0
    const remoteTime = remote?.lastModifiedAt ? new Date(remote.lastModifiedAt).getTime() : 0
    const [winner, loser] = remoteTime > localTime ? [remote, local] : [local, remote]
    const merged = { ...(loser || {}), ...(winner || {}) }
    return stripSettingsMeta(merged)
  }
}

// Identity/row-metadata keys that ride along on a Supabase settings row (after
// snakeToCamel) but are NOT app settings. Stripped before the merged object is
// mirrored to localStorage, which loadSettings reads as if every key were a
// setting. lastModifiedAt is deliberately KEPT — it drives the LWW compare above.
const SETTINGS_META_KEYS = ['userId', 'user_id', 'id', 'createdAt', 'created_at', 'deviceId', 'device_id']
function stripSettingsMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const clean = { ...obj }
  for (const k of SETTINGS_META_KEYS) delete clean[k]
  return clean
}

export const pollManager = new PollManager()
