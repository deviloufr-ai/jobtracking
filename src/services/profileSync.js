// Cross-device sync for the user profile (contact info, home address, and the
// profile extracted from the base CV). The profile is a single JSON blob kept in
// localStorage under `jobtrackr_profile`; here we mirror it to Supabase in the
// pre-existing `user_metadata.cv_profile_json` column so it follows the user to
// other devices (e.g. desktop → mobile). No DB migration required.
import { supabase, isSupabaseConfigured } from './supabase'

const PROFILE_KEY = 'jobtrackr_profile'
export const PROFILE_SYNCED_EVENT = 'jobtrackr-profile-synced'

export function loadLocalProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Push the local profile blob up to user_metadata (upsert keyed on user_id).
export async function pushProfile(profile) {
  if (!isSupabaseConfigured() || !profile) return
  try {
    const { data } = await supabase.auth.getUser()
    const userId = data?.user?.id
    if (!userId) return
    const { error } = await supabase
      .from('user_metadata')
      .upsert(
        { user_id: userId, cv_profile_json: profile, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (error) console.warn('Profile sync (push) failed:', error.message)
  } catch (e) {
    console.warn('Profile sync (push) error:', e.message)
  }
}

// Pull the remote profile into localStorage (remote wins) and notify readers.
// Returns the remote profile object, or null when none is stored yet.
export async function pullProfile(userId) {
  if (!isSupabaseConfigured() || !userId) return null
  try {
    const { data, error } = await supabase
      .from('user_metadata')
      .select('cv_profile_json')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn('Profile sync (pull) failed:', error.message)
      return null
    }
    const remote = data?.cv_profile_json
    if (remote && typeof remote === 'object') {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(remote))
        window.dispatchEvent(new CustomEvent(PROFILE_SYNCED_EVENT, { detail: remote }))
      } catch { /* quota / serialization — non-critical */ }
      return remote
    }
    return null
  } catch (e) {
    console.warn('Profile sync (pull) error:', e.message)
    return null
  }
}
