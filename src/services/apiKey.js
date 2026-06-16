// Shared helpers for talking to the AI endpoints with the user's own Claude key.
//
// The user's key lives in localStorage (set from Settings → API Claude). When
// present we attach it to every AI request so calls bill the user and bypass the
// shared-key free-trial quota. When absent, requests fall back to the project's
// shared key, which the server caps per IP — once that budget is spent the server
// replies 402 { code: 'TRIAL_EXHAUSTED' } and we surface a prompt to add a key.

export const API_KEY_STORAGE = 'jobtrackr_claude_api_key'
export const TRIAL_EXHAUSTED_FLAG = 'jobtrackr_trial_exhausted'

export function getUserApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || null
  } catch {
    return null
  }
}

// Merge the user's key into a request body (no-op when no key is configured).
export function withUserApiKey(body = {}) {
  const key = getUserApiKey()
  return key ? { ...body, apiKey: key } : body
}

export class TrialExhaustedError extends Error {
  constructor(message) {
    super(message || 'Free trial used up — add your Claude API key to continue.')
    this.name = 'TrialExhaustedError'
    this.code = 'TRIAL_EXHAUSTED'
  }
}

// Notify the app that the shared-key trial is exhausted so it can prompt the user.
export function signalTrialExhausted() {
  try { localStorage.setItem(TRIAL_EXHAUSTED_FLAG, '1') } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jobtrackr:trial-exhausted'))
  }
}

/**
 * POST JSON to an AI endpoint with the user's key attached. Returns the raw
 * Response so callers keep their existing res.ok / res.json() handling. Throws
 * TrialExhaustedError on a 402 so the trial wall short-circuits cleanly.
 */
export async function aiFetch(url, body = {}, init = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: JSON.stringify(withUserApiKey(body)),
    ...init,
  })

  if (res.status === 402) {
    let message
    try { message = (await res.json())?.error } catch {}
    signalTrialExhausted()
    throw new TrialExhaustedError(message)
  }

  return res
}
