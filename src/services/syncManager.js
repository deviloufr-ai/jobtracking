import { supabase, isSupabaseConfigured } from './supabase'
import { indexeddb } from './indexeddb'

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
    this.retryCount = {}
    this.maxRetries = 5
    this.maxBackoffMs = 30000

    // Listen to online/offline events
    window.addEventListener('online', () => this.handleOnline())
    window.addEventListener('offline', () => this.handleOffline())
  }

  handleOnline() {
    this.isOnline = true
    this.notifyListeners({ status: 'online' })
    // Flush queue when coming online
    this.flushQueue()
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
  async mutate(userId, table, type, record) {
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
      const result = await this.sendMutationToSupabase(userId, table, type, record)
      console.log('✓ Sync successful:', result)
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
      'status',
      'notes',
      'date',
      'favorite',
      'enrichedAt',
      'updated_at',
      'last_modified_at',
      'from',
      'offerUrl',
    ])

    const cleaned = {}
    for (const key of Object.keys(record)) {
      if (safeFields.has(key) && record[key] !== undefined) {
        cleaned[key] = record[key]
      }
    }

    return cleaned
  }

  async sendMutationToSupabase(userId, table, type, record) {
    if (!userId) throw new Error('User not authenticated')

    let result

    // For jobs table, extract history and strip local-only fields
    let jobRecord = record
    let history = null
    if (table === 'jobs') {
      const { history: h, ...jobWithoutHistory } = record
      jobRecord = jobWithoutHistory
      history = h
      // Strip local-only fields (_merged, _history, etc.)
      jobRecord = this.stripLocalOnlyFields(jobRecord)
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

    // Sync job history if present
    if (table === 'jobs' && history && Array.isArray(history) && result.data && result.data[0]) {
      const jobId = result.data[0].id || record.id
      const historyEntries = history.map(entry => ({
        job_id: jobId,
        user_id: userId,
        date: entry.date,
        status: entry.status || null,
        note: entry.note || null,
        meeting_link: entry.meetingLink || null,
        gmail_id: entry.gmailId || null,
        gmail_ids: entry.gmailIds || null,
        offer_url: entry.offerUrl || null,
        show_cv_button: entry.showCVButton || false,
        from_email: entry.from || null,
        from_me: entry.fromMe || false,
        source: entry.source || null,
        raw_start: entry.rawStart || null,
        version: 1,
        device_id: entry.device_id || null,
        last_modified_at: new Date().toISOString()
      }))

      // Upsert history (for updates, this adds new entries)
      const { error: historyError } = await supabase
        .from('job_history')
        .upsert(historyEntries, { onConflict: 'id' })

      if (historyError) {
        console.error('Error syncing job history:', historyError)
        // Don't throw - history is secondary to job sync
      }
    }

    return { success: true, data: result.data }
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

  // Flush queue when online
  async flushQueue(userId) {
    if (this.syncInProgress || !isSupabaseConfigured()) return

    try {
      this.syncInProgress = true
      this.notifyListeners({ status: 'syncing', queueSize: 0 })

      const mutations = await indexeddb.getQueuedMutations()

      if (mutations.length === 0) {
        this.notifyListeners({ status: 'synced' })
        return
      }

      console.log(`Flushing ${mutations.length} queued mutations...`)

      // Process mutations in order (FIFO)
      for (const mutation of mutations) {
        try {
          await this.sendMutationToSupabase(
            userId,
            mutation.table,
            mutation.type,
            mutation.record
          )
          await indexeddb.removeFromQueue(mutation.id)

          // Notify progress
          const remaining = await this.getQueueSize()
          this.notifyListeners({
            status: remaining > 0 ? 'syncing' : 'synced',
            queueSize: remaining
          })
        } catch (err) {
          console.error('Failed to flush mutation:', mutation, err)
          // Don't retry immediately, will retry on next online event
          break
        }
      }

      this.notifyListeners({ status: 'synced', queueSize: 0 })
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
