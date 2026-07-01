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
  } catch (e) {
    console.warn('CV sync (push) error:', e.message)
  }
}

// Remove a CV from Supabase.
export async function deleteCVRemote(id) {
  if (!isSupabaseConfigured() || !id) return
  try {
    const userId = await currentUserId()
    if (!userId) return
    const { error } = await supabase.from('cvs').delete().eq('id', id).eq('user_id', userId)
    if (error) console.warn('CV sync (delete) failed:', error.message)
  } catch (e) {
    console.warn('CV sync (delete) error:', e.message)
  }
}

// One-time bulk upload of every local CV — ensures CVs created before sync was
// wired (or offline) reach Supabase. Idempotent (upsert on id).
export async function pushAllCVs(userId) {
  if (!isSupabaseConfigured() || !userId) return
  try {
    const cvs = await indexeddb.getAllCVs()
    if (!cvs?.length) return
    const rows = cvs.map(cv => toRow(cv, userId))
    const { error } = await supabase.from('cvs').upsert(rows, { onConflict: 'id' })
    if (error) console.warn('CV bulk upload failed:', error.message)
    else console.log('📤 Bulk-uploaded', rows.length, 'CV(s) to Supabase')
  } catch (e) {
    console.warn('CV bulk upload error:', e.message)
  }
}
