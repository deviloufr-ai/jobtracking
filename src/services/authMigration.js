// One-time migration: repoint a user's rows from the legacy gmail-derived sync
// UUID(s) to their Supabase auth.uid().
//
// Background: jobs/job_history/cvs/user_settings/position_checks used to be keyed
// by a client-minted "sync UUID" resolved from the Gmail address. We've switched
// the identity to the real Supabase auth.uid(). This moves existing rows over so
// the data shows up under the authenticated identity.
//
// Runs CLIENT-SIDE while RLS is still OFF (the anon key can UPDATE any user_id).
// This is the window before migration 004 turns RLS back on. Guarded so it runs
// at most once per auth user (localStorage flag).

import { supabase } from './supabase'
import { getConnectedAccounts } from './gmail'

const LEGACY_SYNC_KEY = 'jt_sync_user_id'
const migratedFlagKey = (authUid) => `jobtrackr_auth_migrated:${authUid}`

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tables whose rows carry a user_id we need to repoint.
const TABLES = ['jobs', 'job_history', 'cvs', 'user_settings', 'position_checks']

// Collect every legacy sync UUID that might own this user's data:
//   • the locally cached sync UUID (present in their normal browser), and
//   • whatever the gmail→uuid mapping returns for the auth email + any connected
//     Gmail addresses (covers a fresh browser/incognito with no local cache).
async function collectLegacyUuids(authUid, authEmail) {
  const uuids = new Set()

  try {
    const cached = localStorage.getItem(LEGACY_SYNC_KEY)
    if (cached && UUID_RE.test(cached)) uuids.add(cached)
  } catch { /* ignore */ }

  const emails = new Set()
  if (authEmail) emails.add(authEmail.toLowerCase())
  try {
    for (const e of getConnectedAccounts()) if (e) emails.add(String(e).toLowerCase())
  } catch { /* ignore */ }

  if (emails.size > 0) {
    try {
      const { data, error } = await supabase
        .from('gmail_user_sync_mapping')
        .select('sync_uuid')
        .in('gmail_email', [...emails])
      if (!error && data) {
        for (const row of data) if (row.sync_uuid && UUID_RE.test(row.sync_uuid)) uuids.add(row.sync_uuid)
      }
    } catch { /* ignore — mapping lookup is best-effort */ }
  }

  // Never migrate the auth uid onto itself.
  uuids.delete(authUid)
  return [...uuids]
}

/**
 * Migrate this user's rows from legacy sync UUID(s) → auth.uid(). Idempotent and
 * guarded so it runs at most once per auth user. Returns a summary object.
 */
export async function migrateToAuthIdentity(user) {
  const authUid = user?.id
  const authEmail = user?.email
  if (!authUid) return { migrated: false, reason: 'no-auth-uid' }

  // Already done on this device for this user.
  try {
    if (localStorage.getItem(migratedFlagKey(authUid))) {
      return { migrated: false, reason: 'already-migrated' }
    }
  } catch { /* ignore */ }

  const legacyUuids = await collectLegacyUuids(authUid, authEmail)
  if (legacyUuids.length === 0) {
    // Nothing to move (genuinely new user, or already on auth.uid()). Mark done.
    try { localStorage.setItem(migratedFlagKey(authUid), new Date().toISOString()) } catch { /* ignore */ }
    return { migrated: false, reason: 'no-legacy-data' }
  }

  console.log('🔀 Auth migration: repointing rows from', legacyUuids, '→', authUid)

  const counts = {}
  let hadError = false
  for (const oldUuid of legacyUuids) {
    for (const table of TABLES) {
      try {
        const { data, error } = await supabase
          .from(table)
          .update({ user_id: authUid })
          .eq('user_id', oldUuid)
          .select('id')
        if (error) {
          hadError = true
          console.error(`Auth migration: ${table} update failed for ${oldUuid}:`, error.message)
        } else {
          counts[table] = (counts[table] || 0) + (data?.length || 0)
        }
      } catch (err) {
        hadError = true
        console.error(`Auth migration: ${table} threw for ${oldUuid}:`, err?.message)
      }
    }
  }

  // Only set the guard flag if every table updated cleanly, so a partial failure
  // (e.g. a transient network error) retries on the next sign-in.
  if (!hadError) {
    try { localStorage.setItem(migratedFlagKey(authUid), new Date().toISOString()) } catch { /* ignore */ }
  }

  console.log('🔀 Auth migration complete:', counts, hadError ? '(with errors — will retry)' : '')
  return { migrated: true, counts, hadError, legacyUuids }
}
