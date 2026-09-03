// Cross-device job-deletion tombstones (High #2).
//
// Deleting a job hard-deletes its Supabase row and records a tombstone only in
// this browser's localStorage — but the poll loop only fetches rows with
// updated_at > lastSync, so it never learns of a deletion and the job lingers
// forever on the user's other devices. This module writes an explicit tombstone
// into the `deleted_jobs` table (RLS-scoped to auth.uid()); the poll loop reads it
// and removes the matching local job. See pollManager.applyRemoteTombstones.
//
// Producer side is offline-safe: ids that fail to insert (offline / transient
// error) stay in a localStorage pending queue and are retried on the next poll
// (flushPendingTombstones) or when the device comes back online.

import { supabase, isSupabaseConfigured, resolveAuthUserId } from './supabase'

const PENDING_KEY = 'jobtrackr_pending_tombstones'

function readPending() {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function writePending(ids) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(ids)]))
  } catch {}
}

function addPending(id) {
  if (!id) return
  const ids = readPending()
  if (!ids.includes(id)) {
    ids.push(id)
    writePending(ids)
  }
}

function removePending(doneIds) {
  if (!doneIds.length) return
  const done = new Set(doneIds)
  writePending(readPending().filter(id => !done.has(id)))
}

// Best-effort upsert of a batch of tombstone ids for the given user. Returns the
// ids successfully written (so the caller can clear them from the pending queue).
async function upsertTombstones(userId, ids) {
  if (!userId || !ids.length || !isSupabaseConfigured()) return []
  const rows = ids.map(job_id => ({ user_id: userId, job_id }))
  // Upsert with ignoreDuplicates ⇒ INSERT ... ON CONFLICT DO NOTHING, so a repeat
  // write (UNIQUE(user_id, job_id)) is a harmless no-op.
  const { error } = await supabase
    .from('deleted_jobs')
    .upsert(rows, { onConflict: 'user_id,job_id', ignoreDuplicates: true })
  if (error) {
    console.warn('Tombstone upsert failed (will retry):', error.message)
    return []
  }
  return ids
}

// Record that `jobId` was deleted, propagating it to the user's other devices.
// Fire-and-forget: queues locally first (so an offline/failed insert is retried),
// then attempts an immediate write.
export async function enqueueRemoteTombstone(jobId) {
  if (!jobId) return
  addPending(jobId)
  try {
    const userId = await resolveAuthUserId()
    const done = await upsertTombstones(userId, [jobId])
    removePending(done)
  } catch (err) {
    // Stays in the pending queue; flushPendingTombstones retries on the next poll.
    console.warn('enqueueRemoteTombstone deferred:', err?.message)
  }
}

// Retry any tombstone ids not yet confirmed remotely (offline/error backlog).
export async function flushPendingTombstones(userId) {
  const pending = readPending()
  if (!pending.length) return
  const done = await upsertTombstones(userId, pending)
  removePending(done)
}

// Fetch the user's tombstones. Pass `since` (ISO string) for an incremental fetch;
// pass null/undefined for a full fetch (used on the coordinator's first poll).
export async function fetchRemoteTombstones(userId, since) {
  if (!userId || !isSupabaseConfigured()) return []
  let query = supabase.from('deleted_jobs').select('job_id, deleted_at').eq('user_id', userId)
  if (since) query = query.gt('deleted_at', since)
  const { data, error } = await query
  if (error) {
    console.warn('Tombstone fetch failed:', error.message)
    return []
  }
  return data || []
}

// Erase ALL of the user's remote tombstones — used by the "clear deleted jobs /
// re-import" flow so re-imported jobs aren't deleted again on the next poll.
export async function clearRemoteTombstones(userId) {
  if (!userId || !isSupabaseConfigured()) return
  const { error } = await supabase.from('deleted_jobs').delete().eq('user_id', userId)
  if (error) console.warn('Clear remote tombstones failed:', error.message)
  // Also drop any unconfirmed local pending tombstones.
  writePending([])
}

// ── History-ENTRY tombstones (migration 013) ────────────────────────────────
// Entry-level analogue of the job tombstones above: propagates the deletion of a
// single timeline entry across devices, so the additive poll merge can't re-admit
// it. Composite key is `${jobId}::${entryKey}` (entryKey = canonical historyEntryKey).
// Fully graceful: if `deleted_history_entries` doesn't exist yet, every remote op
// no-ops and the deletion stays local-only (exactly the old behaviour).

const HISTORY_PENDING_KEY = 'jobtrackr_pending_history_tombstones'

function readHistoryPending() {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_PENDING_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function writeHistoryPending(keys) {
  try { localStorage.setItem(HISTORY_PENDING_KEY, JSON.stringify([...new Set(keys)])) } catch {}
}
function addHistoryPending(compositeKey) {
  if (!compositeKey) return
  const keys = readHistoryPending()
  if (!keys.includes(compositeKey)) { keys.push(compositeKey); writeHistoryPending(keys) }
}
function removeHistoryPending(doneKeys) {
  if (!doneKeys.length) return
  const done = new Set(doneKeys)
  writeHistoryPending(readHistoryPending().filter(k => !done.has(k)))
}

function compositeToRow(userId, compositeKey) {
  const sep = compositeKey.indexOf('::')
  return { user_id: userId, job_id: compositeKey.slice(0, sep), entry_key: compositeKey.slice(sep + 2) }
}

// Best-effort upsert of a batch of composite `jobId::entryKey` tombstones. Returns
// the composites successfully written (so the caller can clear them from pending).
async function upsertHistoryTombstones(userId, compositeKeys) {
  if (!userId || !compositeKeys.length || !isSupabaseConfigured()) return []
  const rows = compositeKeys.map(k => compositeToRow(userId, k))
  const { error } = await supabase
    .from('deleted_history_entries')
    .upsert(rows, { onConflict: 'user_id,job_id,entry_key', ignoreDuplicates: true })
  if (error) {
    console.warn('History-tombstone upsert failed (will retry):', error.message)
    return []
  }
  return compositeKeys
}

// Record that a timeline entry was deleted, propagating it to the user's other
// devices. Fire-and-forget: queues locally first, then attempts an immediate write.
export async function enqueueHistoryTombstone(jobId, entryKey) {
  if (!jobId || !entryKey) return
  const composite = `${jobId}::${entryKey}`
  addHistoryPending(composite)
  try {
    const userId = await resolveAuthUserId()
    const done = await upsertHistoryTombstones(userId, [composite])
    removeHistoryPending(done)
  } catch (err) {
    console.warn('enqueueHistoryTombstone deferred:', err?.message)
  }
}

// Retry any history tombstones not yet confirmed remotely (offline/error backlog).
export async function flushPendingHistoryTombstones(userId) {
  const pending = readHistoryPending()
  if (!pending.length) return
  const done = await upsertHistoryTombstones(userId, pending)
  removeHistoryPending(done)
}

// Fetch the user's history-entry tombstones. `since` (ISO) → incremental fetch.
export async function fetchRemoteHistoryTombstones(userId, since) {
  if (!userId || !isSupabaseConfigured()) return []
  let query = supabase.from('deleted_history_entries').select('job_id, entry_key, deleted_at').eq('user_id', userId)
  if (since) query = query.gt('deleted_at', since)
  const { data, error } = await query
  if (error) {
    console.warn('History-tombstone fetch failed:', error.message)
    return []
  }
  return data || []
}
