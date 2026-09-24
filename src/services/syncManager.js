import { supabase, isSupabaseConfigured } from './supabase'
import { indexeddb } from './indexeddb'
import { convertHistoryToSupabase, settingsToSupabaseRow } from './fieldConversion'
import { historyEntryKey, deletedHistoryKeysFor } from '../hooks/useJobs'

// Rich per-job fields with no dedicated column — bundled into the `jobs.extras`
// jsonb blob so generated CVs, cover letters, scores and interview data sync
// across devices. Requires migration 007 (jobs.extras jsonb).
const EXTRA_FIELDS = [
  'cvSaved', 'letterSaved', 'starSaved',
  'score', 'scoreDetails', 'scoreSignature',
  'interviewSessions', 'useCase',
  'salaryMin', 'salaryMax', 'location', 'companyAddress', 'companyFromAts',
  // enrichedAt gates re-enrichment (isEnriched); sentAt times follow-up reminders.
  // Without syncing them, a remote-wins poll dropped them → needless paid re-enrich
  // and mis-timed reminders, and they never existed at all on a fresh device.
  'enrichedAt', 'sentAt',
  // salaryFetchedAt gates the auto salary fill (useAutoSalary): once set, that job
  // is never re-researched (found or not), so a synced marker stops other devices
  // from re-paying for the same web search. Mirrors enrichedAt.
  'salaryFetchedAt',
  // compensation: structured offer/comp data ({ base, bonus, equity, currency… }).
  // contacts: the per-application networking mini-CRM (people + touchpoints).
  // letterVersions: cover-letter version history (letterSaved stays the current one).
  // negotiationSaved: the last saved negotiation draft ({ content, savedAt }).
  // All ride the existing jobs.extras jsonb blob — no schema migration needed.
  'compensation', 'contacts', 'letterVersions', 'negotiationSaved',
  // interviewExamples: per-round cached example interviews (Q + model answers),
  // keyed by round ({ screening, technical, … , general }). Rides jobs.extras.
  'interviewExamples',
  // mindMap: the interview memory map (themes → keywords → stories/questions/cues).
  // A reset writes {} (not null) so the union write actually clears it server-side.
  'mindMap',
  // positionLinks / positionChecks: discovered apply-links and the per-URL
  // "is this posting still open" check results. These are written by useAutoRefresh
  // and checkPosition and are deserialized on the read path (deserializeJobFields),
  // but there is NO dedicated jobs column for them (only an unused position_checks
  // TABLE) and they weren't in stripLocalOnlyFields' safe list — so every write
  // silently dropped them and they never reached another device. Ride jobs.extras.
  'positionLinks', 'positionChecks',
]

// Collect the present extra fields off a full job record into a jsonb blob.
// Returns null when none are set (so we don't overwrite a stored blob with {}).
function buildExtras(record) {
  if (!record) return null
  const extras = {}
  for (const f of EXTRA_FIELDS) {
    if (record[f] !== undefined && record[f] !== null) extras[f] = record[f]
  }
  return Object.keys(extras).length ? extras : null
}

// The job_history.entry_key column / UNIQUE(job_id, entry_key) constraint from
// migration 016 is not there yet: PostgREST schema-cache miss, unknown column, or
// "no unique constraint matching the ON CONFLICT specification".
function isSchemaMissingError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return code === 'PGRST204' || code === '42703' || code === '42P10' ||
    (/entry_key/i.test(msg) && /column|constraint|conflict/i.test(msg))
}

// A failure that no retry can fix until the session is restored.
function isAuthError(err) {
  const msg = String(err?.message || err || '')
  return err?.status === 401 || /not authenticated|jwt|401/i.test(msg)
}

// Simple UUID generation
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine
    this.syncInProgress = false
    this.listeners = []
    this.debounceTimer = null
    // Attempts a queued mutation gets before it is dropped (see flushQueue).
    this.maxRetries = 5
    // Last userId seen by mutate()/flushQueue(). The 'online' handler below has no
    // caller to hand it one, so it flushes with this.
    this.userId = null

    // Listen to online/offline events
    window.addEventListener('online', () => this.handleOnline())
    window.addEventListener('offline', () => this.handleOffline())
  }

  handleOnline() {
    this.isOnline = true
    this.notifyListeners({ status: 'online' })
    // Flush queue when coming online. Only when we know the user: an unauthenticated
    // flush used to grab the syncInProgress lock first, fail on 'User not
    // authenticated', and thereby make the coordinator's authenticated flush (same
    // 'online' event) a no-op — so coming back online never drained the queue.
    if (this.userId) this.flushQueue(this.userId)
  }

  handleOffline() {
    this.isOnline = false
    this.notifyListeners({ status: 'offline' })
  }

  // Register listener for sync status changes
  onStatusChange(callback) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  notifyListeners(status) {
    this.listeners.forEach(listener => listener(status))
  }

  async getQueueSize() {
    const mutations = await indexeddb.getQueuedMutations()
    return mutations.length
  }

  // Queue a mutation when offline
  async queueMutation(table, type, record) {
    const mutation = {
      id: generateId(),
      table,
      type, // 'insert' | 'update' | 'delete'
      record,
      timestamp: Date.now()
    }

    await indexeddb.addToQueue(mutation)
    this.notifyListeners({
      status: this.isOnline ? 'syncing' : 'offline',
      queueSize: await this.getQueueSize()
    })

    return mutation.id
  }

  // Execute mutation and queue if offline
  async mutate(userId, table, type, record, options = {}) {
    if (userId) this.userId = userId
    // Apply to local cache first (optimistic update)
    await this.applyToLocalCache(table, type, record)

    // If Supabase not configured, only save to local cache
    if (!isSupabaseConfigured()) {
      console.warn('⚠ Supabase not configured, saving to local cache only')
      return { success: true, local: true }
    }

    // If offline, queue and return
    if (!this.isOnline) {
      console.log('📦 Device offline, queuing mutation:', type, table)
      const mutationId = await this.queueMutation(table, type, record)
      return { success: true, offline: true, mutationId }
    }

    // If online, send to Supabase immediately
    try {
      console.log('🔄 Syncing to Supabase:', type, table, record.id)
      const result = await this.sendMutationToSupabase(userId, table, type, record, options)
      console.log('✓ Sync successful:', result)
      // The connection just proved healthy: retry anything still queued from an
      // earlier failure, without waiting for the next online event / manual sync.
      this.flushQueue(userId).catch(() => {})
      return result
    } catch (err) {
      console.error('✗ Mutation failed, queuing for retry:', err)
      await this.queueMutation(table, type, record)
      this.notifyListeners({ status: 'offline', queueSize: await this.getQueueSize() })
      throw err
    }
  }

  async applyToLocalCache(table, type, record) {
    switch (table) {
      case 'jobs':
        if (type === 'delete') {
          await indexeddb.deleteJob(record.id)
        } else {
          await indexeddb.saveJob(record)
        }
        break
      case 'cvs':
        await indexeddb.saveCV(record)
        break
      case 'settings':
        await indexeddb.saveSettings(record)
        break
    }
  }

  stripLocalOnlyFields(record) {
    if (!record) return record

    // Whitelist: only these fields are safe to sync to Supabase
    const safeFields = new Set([
      'id',
      'company',
      'position',
      'url',
      'status',
      'notes',
      'date',
      'favorite',
      'updated_at',
      'last_modified_at',
      'from',
      'jobDescription', // full JD captured at import (extension/search) — needed by CV generator
    ])

    // Fields that need JSON serialization for Supabase
    const jsonFields = new Set(['positionLinks', 'positionChecks'])

    const cleaned = {}
    for (const key of Object.keys(record)) {
      if (safeFields.has(key) && record[key] !== undefined) {
        // Serialize complex types to JSON string for storage
        if (jsonFields.has(key) && (Array.isArray(record[key]) || typeof record[key] === 'object')) {
          cleaned[key] = JSON.stringify(record[key])
        } else {
          cleaned[key] = record[key]
        }
      }
    }

    return cleaned
  }

  camelToSnake(obj) {
    if (!obj || typeof obj !== 'object') return obj
    const snake = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      snake[snakeKey] = value
    }
    return snake
  }

  // Union this device's extras with the server's current blob so a write never
  // narrows what a peer device stored. Only needed for updates (an insert is a
  // brand-new row with no prior extras). On any read failure we fall back to the
  // local extras — no worse than the previous unconditional overwrite.
  async mergeServerExtras(userId, type, jobId, localExtras) {
    if (type !== 'update' || !jobId) return localExtras
    try {
      const { data: existing } = await supabase
        .from('jobs')
        .select('extras')
        .eq('id', jobId)
        .eq('user_id', userId)
        .maybeSingle()
      const serverExtras = (existing && existing.extras && typeof existing.extras === 'object' && !Array.isArray(existing.extras))
        ? existing.extras
        : {}
      return { ...serverExtras, ...localExtras }
    } catch (err) {
      console.warn('extras merge read failed, writing local extras only:', err?.message)
      return localExtras
    }
  }

  async sendMutationToSupabase(userId, table, type, record, options = {}) {
    if (!userId) throw new Error('User not authenticated')

    let result

    // user_settings is a per-user singleton (UNIQUE(user_id)) with NO id in the
    // app's settings object. The generic update-by-id path below filtered by
    // .eq('id', undefined) (→ id=eq.undefined, matching nothing) AND sent the raw
    // camelCase record (→ PGRST204 "Could not find the 'archiveRejectedDays'
    // column"). Upsert on user_id with an explicit snake_case column map instead.
    if (table === 'user_settings') {
      const row = settingsToSupabaseRow(userId, record)
      const res = await supabase
        .from('user_settings')
        .upsert(row, { onConflict: 'user_id' })
        .select()
      if (res.error) {
        console.error('Mutation error:', res.status, res.error)
        throw res.error
      }
      return { success: true, data: res.data }
    }

    // For jobs table, extract history and strip local-only fields
    let jobRecord = record
    let history = null
    if (table === 'jobs') {
      const { history: h, ...jobWithoutHistory } = record
      jobRecord = jobWithoutHistory
      history = h
      // Bundle rich local-only fields (CV, letter, score, sessions…) from the
      // FULL record before stripping — attached after snake-casing so the blob's
      // camelCase keys survive untouched.
      const extras = buildExtras(record)
      // Strip local-only fields (_merged, _history, etc.)
      jobRecord = this.stripLocalOnlyFields(jobRecord)
      // Convert camelCase to snake_case for Supabase
      jobRecord = this.camelToSnake(jobRecord)
      if (extras) {
        // `extras` is a WHOLE jsonb blob and buildExtras only ever contains the
        // fields THIS device currently holds. On an update that would REPLACE the
        // server blob — silently wiping any extra field a peer set but this device
        // hasn't polled yet. Concrete loss: device A generates a CV (cvSaved); before
        // B's next 5-min poll, B edits the same job's status → B's write drops
        // cvSaved from the server, and B never receives it (its own poll now returns
        // the narrowed blob). The READ path unions extras (pollManager.mergeJob) but
        // the WRITE path had no union, so scores/CVs/letters/interview data vanished
        // across devices. Merge into the server's current blob (this device wins per
        // key). buildExtras never emits null/undefined, so this can never CLEAR a
        // field — it only ever adds/overwrites, which is exactly the LWW intent.
        jobRecord.extras = await this.mergeServerExtras(userId, type, jobRecord.id, extras)
      }
    }

    switch (type) {
      case 'insert':
        result = await supabase
          .from(table)
          .insert({ ...jobRecord, user_id: userId })
          .select('id')
        break

      case 'update':
        result = await supabase
          .from(table)
          .update(jobRecord)
          .eq('id', jobRecord.id)
          .eq('user_id', userId)
          .select()
        break

      case 'delete':
        result = await supabase
          .from(table)
          .delete()
          .eq('id', jobRecord.id)
          .eq('user_id', userId)
        break
    }

    if (result.error) {
      // 409 = conflict - but for now, just throw to see actual error
      console.error('Mutation error:', result.status, result.error)
      throw result.error
    }

    // Sync job history if present — but skip when the caller signals that this
    // mutation didn't touch history (e.g. favorite toggle, enrichment flag).
    // Avoids a destructive delete+reinsert of the whole timeline on every field edit.
    if (options.syncHistory !== false && table === 'jobs' && history && Array.isArray(history) && result.data && result.data[0]) {
      const jobId = result.data[0].id || record.id

      // History is secondary to the job row: never fail the mutation over it.
      try {
        await this.writeJobHistory(userId, jobId, history)
      } catch (err) {
        console.error('Error syncing job history:', err)
      }
    }

    return { success: true, data: result.data }
  }

  // Server-side write of ONE job's timeline.
  //
  // Post-migration 016 (job_history.entry_key + UNIQUE(job_id, entry_key)): UPSERT on
  // the canonical historyEntryKey. Rows keep a stable identity, there is no
  // delete-then-reinsert window where a concurrent poll sees an empty timeline, and a
  // peer device's entries written since our last poll SURVIVE (replace-all dropped
  // them). Only two kinds of rows are deleted: legacy rows with no key (all present
  // locally after the poll merge, so replacing them loses nothing) and rows whose key
  // this device tombstoned (migration 013 carries the same key to peers).
  //
  // Pre-016 (column/constraint missing): falls back to the old replace-all and
  // remembers that for the session, so the app is deployable before the migration.
  async writeJobHistory(userId, jobId, history) {
    const seen = new Set()
    const rows = []
    for (const entry of Array.isArray(history) ? history : []) {
      const key = historyEntryKey(entry)
      if (!key || seen.has(key)) continue
      seen.add(key)
      rows.push({ job_id: jobId, user_id: userId, entry_key: key, ...convertHistoryToSupabase(entry) })
    }

    if (this.historyUpsertSupported !== false) {
      const res = rows.length
        ? await supabase.from('job_history').upsert(rows, { onConflict: 'job_id,entry_key' })
        : { error: null }
      if (!res.error) {
        this.historyUpsertSupported = true
        const legacy = await supabase.from('job_history').delete().eq('job_id', jobId).eq('user_id', userId).is('entry_key', null)
        if (legacy.error) console.warn('history: legacy row cleanup failed:', legacy.error.message)
        const dead = deletedHistoryKeysFor(jobId)
        if (dead.length) {
          const del = await supabase.from('job_history').delete().eq('job_id', jobId).eq('user_id', userId).in('entry_key', dead)
          if (del.error) console.warn('history: tombstoned row cleanup failed:', del.error.message)
        }
        return { mode: 'upsert', count: rows.length }
      }
      if (!isSchemaMissingError(res.error)) throw res.error
      this.historyUpsertSupported = false
      console.warn('job_history.entry_key not available yet (apply migration 016) — using replace-all history sync this session')
    }

    // Legacy: replace the whole timeline (pre-016 schema has no entry_key column).
    const legacyRows = rows.map(({ entry_key: _k, ...r }) => r)
    const deleteResult = await supabase.from('job_history').delete().eq('job_id', jobId)
    if (deleteResult.error) console.warn('Warning deleting old history:', deleteResult.error)
    if (legacyRows.length > 0) {
      const insertResult = await supabase.from('job_history').insert(legacyRows)
      if (insertResult.error) throw insertResult.error
    }
    return { mode: 'replace', count: legacyRows.length }
  }

  // One-time bulk upload of local jobs to Supabase. Replaces the legacy
  // syncLocalJobsToSupabase() upload half: pushes any local-only jobs (created
  // while the coordinator wasn't ready, imported offline, or pre-existing legacy
  // data) and replaces their history with the deduplicated local copy.
  // The caller MUST poll (fetch+merge remote) first, so local history already
  // contains the merged superset before we delete+reinsert remote rows.
  async pushAllJobs(userId, jobs) {
    if (!userId || !isSupabaseConfigured() || !jobs?.length) {
      return { success: true, skipped: true }
    }

    try {
      // Upsert all job rows in one round-trip (insert new, update existing).
      const jobRows = jobs.map(job => {
        const { history, ...rest } = job
        const cleaned = this.camelToSnake(this.stripLocalOnlyFields(rest))
        const extras = buildExtras(job)
        if (extras) cleaned.extras = extras
        return { ...cleaned, user_id: userId }
      })

      const { error: upsertErr } = await supabase
        .from('jobs')
        .upsert(jobRows, { onConflict: 'id' })
      if (upsertErr) {
        console.warn('Bulk job upsert failed:', upsertErr.message)
      }

      // History per job — the same write a normal mutation does (upsert post-016).
      for (const job of jobs) {
        const history = Array.isArray(job.history) ? job.history : []
        if (history.length === 0) continue
        try {
          await this.writeJobHistory(userId, job.id, history)
        } catch (err) {
          console.warn('Failed to push history for job', job.id, err.message)
        }
      }

      console.log('📤 Bulk-uploaded', jobs.length, 'local jobs to Supabase')
      return { success: true }
    } catch (err) {
      console.warn('pushAllJobs failed (non-critical):', err.message)
      return { success: false, error: err.message }
    }
  }

  async handleConflict(table, record) {
    // Fetch remote version
    const { data: remoteData, error } = await supabase
      .from(table)
      .select()
      .eq('id', record.id)
      .single()

    if (error) {
      console.error('Failed to fetch remote for conflict resolution:', error)
      throw error
    }

    // Merge strategy: remote wins (last-write-wins)
    // But preserve local history entries
    const merged = this.mergeRecords(record, remoteData)

    // Update local cache with merged version
    await this.applyToLocalCache(table, 'update', merged)

    return { success: true, merged: true, data: merged }
  }

  mergeRecords(local, remote) {
    // Last-write-wins on timestamp
    if (!local.last_modified_at || !remote.last_modified_at) {
      return remote // Fallback to remote
    }

    const localTime = new Date(local.last_modified_at).getTime()
    const remoteTime = new Date(remote.last_modified_at).getTime()

    if (localTime > remoteTime) {
      return local
    }

    // Remote is newer, but preserve local history if table is jobs
    if (local.history && Array.isArray(local.history)) {
      const remoteHistory = remote.history || []
      const localHistory = local.history

      // Merge histories (append-only, de-duplicate by date+status)
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

  // Drain the offline/retry queue (FIFO). Called on 'online', before each poll, after a
  // successful online mutate, and from the manual "Sync now" button.
  //
  // Failure handling — the old loop did `break` on the first error, so ONE mutation
  // that failed every time (a 4xx on a bad row, a job the server no longer accepts…)
  // blocked every later mutation forever, with the indicator still saying "synced".
  // Now a failure only parks the mutations of THAT record for this pass (a later
  // update must not overtake its own failed insert), everything else proceeds, and
  // a mutation that has failed maxRetries times is dropped. Dropping is safe: a
  // queued record is a whole snapshot, so the next edit of that record re-sends it
  // all. Auth failures don't count as attempts — nothing can succeed until the
  // session is back, so the pass just stops.
  async flushQueue(userId) {
    if (userId) this.userId = userId
    userId = userId || this.userId
    if (!userId || this.syncInProgress || !isSupabaseConfigured()) return

    try {
      this.syncInProgress = true
      const mutations = await indexeddb.getQueuedMutations()
      // Quiet when there is nothing to do: this runs before every poll/focus.
      if (mutations.length === 0) return

      this.notifyListeners({ status: 'syncing', queueSize: mutations.length })
      console.log(`Flushing ${mutations.length} queued mutations...`)

      const blockedRecords = new Set()
      let failures = 0
      let lastError = null

      for (const mutation of mutations) {
        const recordKey = `${mutation.table}:${mutation.record?.id ?? mutation.id}`
        if (blockedRecords.has(recordKey)) continue
        try {
          await this.sendMutationToSupabase(userId, mutation.table, mutation.type, mutation.record)
          await indexeddb.removeFromQueue(mutation.id)
          this.notifyListeners({ status: 'syncing', queueSize: await this.getQueueSize() })
        } catch (err) {
          failures++
          lastError = err
          if (isAuthError(err)) {
            console.warn('Queue flush paused: not authenticated yet', err?.message)
            break
          }
          blockedRecords.add(recordKey)
          const attempts = (mutation.attempts || 0) + 1
          if (attempts >= this.maxRetries) {
            console.error(`Dropping queued mutation after ${attempts} failed attempts:`, mutation, err)
            await indexeddb.removeFromQueue(mutation.id).catch(() => {})
          } else {
            console.error(`Failed to flush mutation (attempt ${attempts}/${this.maxRetries}):`, mutation, err)
            await indexeddb.updateQueuedMutation({
              ...mutation, attempts, lastError: String(err?.message || err), lastAttemptAt: Date.now(),
            }).catch(() => {})
          }
        }
      }

      const remaining = await this.getQueueSize()
      if (failures && remaining > 0) {
        this.notifyListeners({ status: 'error', queueSize: remaining, error: lastError?.message || 'sync failed' })
      } else {
        this.notifyListeners({ status: 'synced', queueSize: remaining })
      }
    } catch (err) {
      console.error('Queue flush error:', err)
      this.notifyListeners({ status: 'error', error: err.message })
    } finally {
      this.syncInProgress = false
    }
  }

  // Get current sync status
  getStatus() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.syncInProgress
    }
  }
}

export const syncManager = new SyncManager()
