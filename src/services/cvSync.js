// Cross-device sync for base CVs. CVs live in IndexedDB locally; here we mirror
// them to the pre-existing Supabase `cvs` table so they follow the user to other
// devices. The poll (pollManager) already downloads this table — this module
// supplies the missing upload half. No DB migration required.
//
// Field mapping: local `{ id, name, text }` ⇄ Supabase `{ id, name, content_raw }`.
// `pages`/`size` are display-only metadata with no column yet, so they don't
// round-trip (guarded in the UI).
import { supabase, isSupabaseConfigured } from './supabase'
import { indexeddb } from './indexeddb'

function toRow(cv, userId) {
  return {
    id: cv.id,
    user_id: userId,
    name: cv.name || 'CV',
    content_raw: cv.text || '',
    last_modified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// ── Deletion bookkeeping (per device, localStorage — no migration) ───────────
// There is no `deleted_cvs` table, and the poll only ever ADDED remote CVs, so a
// delete could not stick: device B still held the CV in IndexedDB and
// pushAllCVs (every coordinator init) re-upserted it, after which device A
// re-downloaded it. Two small local ledgers close the loop, relying on the fact
// that the poll fetches the FULL `cvs` list every cycle:
//   • SYNCED — ids this device has seen ON the server (pushed OK or pulled), with
//     the time it learned that. A synced CV missing from a later successful fetch
//     was deleted on another device → remove it locally instead of re-uploading.
//   • PENDING_DELETE — ids deleted here whose remote delete isn't confirmed yet
//     (offline / failed). The poll must not re-download them, and retries the delete.
const SYNCED_KEY = 'jobtrackr_cv_synced_ids'
const PENDING_DELETE_KEY = 'jobtrackr_cv_pending_deletes'

function readMap(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}
function writeMap(key, map) {
  try { localStorage.setItem(key, JSON.stringify(map)) } catch { /* quota — non-critical */ }
}
function markSynced(ids, at = Date.now()) {
  if (!ids?.length) return
  const synced = readMap(SYNCED_KEY)
  for (const id of ids) if (id && !synced[id]) synced[id] = at
  writeMap(SYNCED_KEY, synced)
}
function setPendingDelete(id, pending) {
  const map = readMap(PENDING_DELETE_KEY)
  if (pending) map[id] = Date.now()
  else delete map[id]
  writeMap(PENDING_DELETE_KEY, map)
}

// Reconcile the local CV store with the server's full list. Called by the poll
// with the rows it just fetched and the time the fetch STARTED. Returns the ids
// the poll must NOT write into IndexedDB (deleted here, remote delete pending)
// and how many local CVs were removed because another device deleted them.
export async function reconcileRemoteCVs(remoteRows, userId, fetchedAt = Date.now()) {
  const rows = Array.isArray(remoteRows) ? remoteRows : []
  const remoteIds = new Set(rows.map(r => r.id))

  // 1) Deletions made on this device: never resurrect them, and retry the remote
  //    delete for any the server still has.
  const pending = readMap(PENDING_DELETE_KEY)
  const skipIds = new Set(Object.keys(pending))
  for (const id of skipIds) {
    if (!remoteIds.has(id)) { delete pending[id]; continue }   // server agrees — settled
    try {
      const { error } = await supabase.from('cvs').delete().eq('id', id).eq('user_id', userId)
      if (!error) delete pending[id]
    } catch { /* still pending — retried next poll */ }
  }
  writeMap(PENDING_DELETE_KEY, pending)

  // 2) Deletions made on ANOTHER device: a CV this device knew to be on the
  //    server BEFORE this fetch started, and that the fetch no longer returns.
  //    Skipped when the server returns nothing at all — an empty list is also what
  //    an expired session looks like under RLS (200, zero rows), and wiping every
  //    local CV on that would be unrecoverable. (Cost: deleting your LAST CV on
  //    another device doesn't propagate.)
  const synced = readMap(SYNCED_KEY)
  let removed = 0
  if (rows.length > 0) {
    const local = await indexeddb.getAllCVs()
    for (const cv of local || []) {
      const knownAt = synced[cv.id]
      if (knownAt && knownAt < fetchedAt && !remoteIds.has(cv.id)) {
        await indexeddb.deleteCV(cv.id)
        delete synced[cv.id]
        removed++
      }
    }
  }

  // 3) Everything the server returned (and we're keeping) is synced by definition.
  for (const id of remoteIds) if (!skipIds.has(id) && !synced[id]) synced[id] = fetchedAt
  for (const id of skipIds) delete synced[id]
  writeMap(SYNCED_KEY, synced)

  return { skipIds, removed }
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.id || null
  } catch {
    return null
  }
}

// Upsert a single CV to Supabase (insert new / update existing by id).
export async function pushCV(cv) {
  if (!isSupabaseConfigured() || !cv?.id) return
  try {
    const userId = await currentUserId()
    if (!userId) return
    const { error } = await supabase.from('cvs').upsert(toRow(cv, userId), { onConflict: 'id' })
    if (error) console.warn('CV sync (push) failed:', error.message)
    else markSynced([cv.id])
  } catch (e) {
    console.warn('CV sync (push) error:', e.message)
  }
}

// Remove a CV from Supabase. Recorded as pending FIRST so that, if the remote
// delete fails (offline, expired session), the next poll neither re-downloads the
// CV onto this device nor forgets to retry (see reconcileRemoteCVs).
export async function deleteCVRemote(id) {
  if (!id) return
  setPendingDelete(id, true)
  if (!isSupabaseConfigured()) return
  try {
    const userId = await currentUserId()
    if (!userId) return
    const { error } = await supabase.from('cvs').delete().eq('id', id).eq('user_id', userId)
    if (error) console.warn('CV sync (delete) failed:', error.message)
    else setPendingDelete(id, false)
  } catch (e) {
    console.warn('CV sync (delete) error:', e.message)
  }
}

// Bulk upload of every local CV — ensures CVs created before sync was wired (or
// offline) reach Supabase. Idempotent (upsert on id). Runs after the init full
// poll, which has already dropped the CVs another device deleted
// (reconcileRemoteCVs), so what's left locally is safe to upload; ids deleted
// HERE but not yet confirmed remotely are excluded.
export async function pushAllCVs(userId) {
  if (!isSupabaseConfigured() || !userId) return
  try {
    const pending = readMap(PENDING_DELETE_KEY)
    const cvs = (await indexeddb.getAllCVs() || []).filter(cv => cv?.id && !pending[cv.id])
    if (!cvs.length) return
    const rows = cvs.map(cv => toRow(cv, userId))
    const { error } = await supabase.from('cvs').upsert(rows, { onConflict: 'id' })
    if (error) console.warn('CV bulk upload failed:', error.message)
    else {
      markSynced(cvs.map(cv => cv.id))
      console.log('📤 Bulk-uploaded', rows.length, 'CV(s) to Supabase')
    }
  } catch (e) {
    console.warn('CV bulk upload error:', e.message)
  }
}
