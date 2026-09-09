// Shared helpers for talking to the AI endpoints with the user's chosen provider.
//
// The app can route AI calls to Claude (default), Google Gemini, or any
// OpenAI-compatible endpoint (Groq, OpenRouter…). The active provider + its model
// + base URL live in the synced `settings` object; each provider's API KEY lives
// in its own localStorage slot and is NEVER synced. When a key is present we
// attach it (plus provider/model/baseUrl) to every AI request so calls bill the
// user's provider and — for Claude — bypass the shared-key free-trial quota. With
// no Claude key, requests fall back to the project's shared key, which the server
// caps per IP; once spent the server replies 402 { code: 'TRIAL_EXHAUSTED' } and
// we surface a prompt to add a key.

import { AI_PROVIDERS, DEFAULT_AI_PROVIDER } from '../constants/aiProviders'

// Kept for backward-compat (equals the Anthropic key slot). Some callers import it.
export const API_KEY_STORAGE = AI_PROVIDERS.anthropic.keyStorage
export const TRIAL_EXHAUSTED_FLAG = 'jobtrackr_trial_exhausted'

// The service layer runs outside React, so it reads the synced settings straight
// from the localStorage mirror (`jobtrackr_settings`, written by useSettings and
// by the poll on a remote change) rather than from a hook.
function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('jobtrackr_settings') || '{}') || {}
  } catch {
    return {}
  }
}

export function getAiProvider() {
  const p = readSettings().aiProvider
  return AI_PROVIDERS[p] ? p : DEFAULT_AI_PROVIDER
}

// Per-provider API key (localStorage, never synced).
export function getProviderKey(provider = getAiProvider()) {
  const meta = AI_PROVIDERS[provider]
  if (!meta) return null
  try {
    return localStorage.getItem(meta.keyStorage) || null
  } catch {
    return null
  }
}

export function setProviderKey(provider, key) {
  const meta = AI_PROVIDERS[provider]
  if (!meta) return
  try {
    const v = (key || '').trim()
    if (v) localStorage.setItem(meta.keyStorage, v)
    else localStorage.removeItem(meta.keyStorage)
  } catch {}
}

// Active model for a provider: the synced override if set, else the provider
// default. Anthropic has no editable model (pinned by env) → always its default.
export function getProviderModel(provider = getAiProvider()) {
  const meta = AI_PROVIDERS[provider]
  if (!meta) return ''
  if (!meta.settingsModelKey) return meta.defaultModel
  const v = readSettings()[meta.settingsModelKey]
  return (typeof v === 'string' && v.trim()) ? v.trim() : meta.defaultModel
}

// Base URL for an OpenAI-compatible provider (synced). null for the others.
export function getProviderBaseUrl(provider = getAiProvider()) {
  const meta = AI_PROVIDERS[provider]
  if (!meta?.needsBaseUrl) return null
  const v = readSettings()[meta.settingsBaseUrlKey]
  return (typeof v === 'string' && v.trim()) ? v.trim() : null
}

// Everything a request needs to reach the active provider.
export function getActiveAiConfig() {
  const provider = getAiProvider()
  return {
    provider,
    apiKey: getProviderKey(provider),
    model: getProviderModel(provider),
    baseUrl: getProviderBaseUrl(provider),
  }
}

// The active provider's key. Its presence is what lets a request bypass the
// shared Claude trial (and, for non-Claude providers, is required outright).
export function getUserApiKey() {
  return getProviderKey(getAiProvider())
}

// Merge the active provider + key + model + base URL into a request body. The
// model always overrides any hard-coded model a caller passed (e.g. CLAUDE_MODEL)
// so provider and model can never drift apart.
export function withUserApiKey(body = {}) {
  const { provider, apiKey, model, baseUrl } = getActiveAiConfig()
  const out = { ...body, provider }
  if (model) out.model = model
  if (baseUrl) out.baseUrl = baseUrl
  if (apiKey) out.apiKey = apiKey
  return out
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
 * POST JSON to an AI endpoint with the active provider's config attached. Returns
 * the raw Response so callers keep their existing res.ok / res.json() handling.
 * Throws TrialExhaustedError on a 402 so the trial wall short-circuits cleanly.
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
