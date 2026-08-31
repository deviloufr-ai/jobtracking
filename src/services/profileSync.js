// Cross-device sync for the user profile (contact info, home address, and the
// profile extracted from the base CV) PLUS a handful of portable local-only
// preferences that previously never left the device. The profile is a single
// JSON blob kept in localStorage under `jobtrackr_profile`; here we mirror it to
// Supabase in the pre-existing `user_metadata.cv_profile_json` column so it
// follows the user to other devices (e.g. desktop → mobile). No DB migration
// required.
//
// Portable prefs bundled alongside the profile (under a namespaced `__aux` key so
// they never pollute the profile blob's own fields):
//   • CV profile picture      → localStorage `cv_profile_picture` (base64, ~KB)
//   • CV-generation settings   → base CV id, ATS level, rules, custom rules
//   • "Next steps" dismissals  → localStorage `jobtrackr_dismissed_actions`
// These are attached at push time and restored to their own localStorage keys on
// pull, so a fresh device inherits them without a schema change.
import { supabase, isSupabaseConfigured } from './supabase'

const PROFILE_KEY = 'jobtrackr_profile'
export const PROFILE_SYNCED_EVENT = 'jobtrackr-profile-synced'
// Fired after a pull restores the portable prefs, so already-mounted UI (e.g. the
// CV generator's profile picture) can refresh without a reload.
export const AUX_PREFS_SYNCED_EVENT = 'jobtrackr-aux-prefs-synced'

// Portable local-only preference keys folded into `__aux`.
const PICTURE_KEY = 'cv_profile_picture'
const DISMISSED_KEY = 'jobtrackr_dismissed_actions'
const CV_PREF_KEYS = [
  'jobtrackr_cv_base_id',
  'jobtrackr_cv_ats_level',
  'jobtrackr_cv_custom_rules',
  'jobtrackr_cv_rules',
]

export function loadLocalProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Snapshot the portable local-only prefs into a plain object (or null when none
// are set, so we don't upsert an empty blob).
function collectAuxPrefs() {
  const aux = {}
  try {
    const pic = localStorage.getItem(PICTURE_KEY)
    if (pic) aux.profilePicture = pic
  } catch { /* ignore */ }

  const cvPrefs = {}
  for (const k of CV_PREF_KEYS) {
    try {
      const v = localStorage.getItem(k)
      if (v != null) cvPrefs[k] = v
    } catch { /* ignore */ }
  }
  if (Object.keys(cvPrefs).length) aux.cvPrefs = cvPrefs

  try {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) aux.dismissedActions = dismissed
  } catch { /* ignore */ }

  return Object.keys(aux).length ? aux : null
}

// Restore pulled portable prefs into their own localStorage keys and notify
// readers. Remote wins (same LWW trade-off as the profile itself).
function applyAuxPrefs(aux) {
  if (!aux || typeof aux !== 'object') return
  try {
    if (typeof aux.profilePicture === 'string') {
      localStorage.setItem(PICTURE_KEY, aux.profilePicture)
    }
    if (aux.cvPrefs && typeof aux.cvPrefs === 'object') {
      for (const k of CV_PREF_KEYS) {
        if (typeof aux.cvPrefs[k] === 'string') localStorage.setItem(k, aux.cvPrefs[k])
      }
    }
    if (typeof aux.dismissedActions === 'string') {
      localStorage.setItem(DISMISSED_KEY, aux.dismissedActions)
    }
  } catch { /* quota / serialization — non-critical */ }
  try {
    window.dispatchEvent(new CustomEvent(AUX_PREFS_SYNCED_EVENT, { detail: aux }))
  } catch { /* ignore */ }
}

// Push the local profile blob + portable prefs up to user_metadata (upsert keyed
// on user_id). Safe to call with an empty/null profile when only the portable
// prefs changed — it still uploads those.
export async function pushProfile(profile) {
  if (!isSupabaseConfigured()) return
  try {
    const cleanProfile = (profile && typeof profile === 'object') ? profile : {}
    const aux = collectAuxPrefs()
    // Nothing to persist — don't write an empty row.
    if (!Object.keys(cleanProfile).length && !aux) return

    const payload = { ...cleanProfile }
    if (aux) payload.__aux = aux

    const { data } = await supabase.auth.getUser()
    const userId = data?.user?.id
    if (!userId) return
    const { error } = await supabase
      .from('user_metadata')
      .upsert(
        { user_id: userId, cv_profile_json: payload, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (error) console.warn('Profile sync (push) failed:', error.message)
  } catch (e) {
    console.warn('Profile sync (push) error:', e.message)
  }
}

// Convenience: re-read this device's profile + portable prefs and push them.
// Debounced so rapid edits (e.g. typing custom CV rules) collapse into one write.
let auxPushTimer = null
export function pushLocalPrefs({ debounceMs = 1200 } = {}) {
  if (auxPushTimer) clearTimeout(auxPushTimer)
  auxPushTimer = setTimeout(() => {
    auxPushTimer = null
    pushProfile(loadLocalProfile() || {})
  }, debounceMs)
}

// Pull the remote profile into localStorage (remote wins) and notify readers.
// Also restores the portable prefs bundled under `__aux`. Returns the remote
// profile object (portable prefs stripped out), or null when none is stored yet.
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
      const { __aux, ...profileOnly } = remote
      // Restore portable prefs regardless of whether a profile blob exists.
      applyAuxPrefs(__aux)

      if (Object.keys(profileOnly).length) {
        try {
          localStorage.setItem(PROFILE_KEY, JSON.stringify(profileOnly))
          window.dispatchEvent(new CustomEvent(PROFILE_SYNCED_EVENT, { detail: profileOnly }))
        } catch { /* quota / serialization — non-critical */ }
        return profileOnly
      }
      // Remote carried only portable prefs (no profile yet) — treat as "no
      // canonical profile" so the coordinator still pushes this device's local one.
      return null
    }
    return null
  } catch (e) {
    console.warn('Profile sync (pull) error:', e.message)
    return null
  }
}
