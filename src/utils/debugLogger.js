// Check if debug logs are enabled in settings
// TEMPORARY: forced ON while debugging the Supabase auth flow. Revert to the
// settings-gated version below once sign-in is verified.
function isDebugEnabled() {
  return true
}
// eslint-disable-next-line no-unused-vars
function isDebugEnabledFromSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem('jobtrackr_settings') || '{}')
    return settings.debugLogsEnabled === true
  } catch {
    return false
  }
}

export const debugLog = {
  log: (...args) => isDebugEnabled() && console.log(...args),
  warn: (...args) => isDebugEnabled() && console.warn(...args),
  error: (...args) => console.error(...args), // Always show errors
  debug: (...args) => isDebugEnabled() && console.debug(...args),
  info: (...args) => isDebugEnabled() && console.info(...args),
}

export default debugLog
