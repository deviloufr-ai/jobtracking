// Device-local experimental feature flags (opt-in).
//
// Stored in localStorage — intentionally NOT part of the synced `user_settings`
// object, so enabling an experiment needs no Supabase schema change and stays
// scoped to the current device. Components read getFlag() and re-render on the
// 'jobtrackr-flags-changed' event dispatched by setFlag().

const PREFIX = 'jobtrackr_flag_'
export const FLAGS_EVENT = 'jobtrackr-flags-changed'

// Flag identifiers. Job search is hidden by default and re-enabled here.
export const FLAGS = {
  JOB_SEARCH: 'job_search',
  // New "E — Focus + List" layout (left nav rail + master-detail drawer). Opt-in
  // while it's built in parallel; absent/false = the current UI, untouched.
  LAYOUT_E: 'layout_e',
  // Kill-switch for cross-device deletion sync. Stored as a "disable" flag so the
  // feature is ENABLED by default (absent flag = off = feature on); set it true to
  // disable the destructive poll consumer instantly if a false deletion is seen.
  CROSS_DEVICE_DELETE_OFF: 'cross_device_delete_off',
}

export function getFlag(name) {
  try {
    return localStorage.getItem(PREFIX + name) === 'true'
  } catch {
    return false
  }
}

export function setFlag(name, value) {
  try {
    localStorage.setItem(PREFIX + name, value ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent(FLAGS_EVENT, { detail: { name, value: !!value } }))
  } catch {}
}
