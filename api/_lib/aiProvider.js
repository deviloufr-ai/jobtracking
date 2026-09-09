// Multi-provider AI adapter for the serverless functions.
// Files/folders under /api prefixed with "_" are NOT treated as routes by Vercel,
// so this module is import-only and never counts against the 12-function cap.
//
// The whole app speaks Anthropic's Messages shape ({ system, messages, model,
// max_tokens }, response `data.content[0].text`). This adapter lets a caller pick
// a different backend — Google Gemini or any OpenAI-compatible endpoint (Groq,
// OpenRouter, Together, Mistral, a self-hosted gateway…) — by sending a `provider`
// field. Requests are translated INTO the chosen provider's wire format and the
// response is translated BACK into the Anthropic shape, so every endpoint and
// every client caller keeps its existing prompt-building and `.content[0].text`
// parsing untouched.
//
// Only Anthropic has a shared project key (the free trial). Gemini / OpenAI
// require the user to bring their own key — there is no shared fallback for them.

import { assertSafeUrl } from './http.js'

export const PROVIDERS = ['anthropic', 'gemini', 'openai']

export const PROVIDER_LABELS = {
  anthropic: 'Claude',
  gemini: 'Gemini',
  openai: 'the OpenAI-compatible provider',
}

// Per-provider default model used when the client didn't pin one. Anthropic
// keeps its own default (each endpoint passes the model it wants), so it's absent
// here on purpose.
const PROVIDER_DEFAULT_MODEL = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
}

export function normalizeProvider(p) {
  const v = typeof p === 'string' ? p.trim().toLowerCase() : ''
  return PROVIDERS.includes(v) ? v : 'anthropic'
}

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Resolve which backend + credentials a request should use.
 *
 * @param {object} req            The serverless request (reads req.body).
 * @param {string} anthropicModel The model to use for the Anthropic path (each
 *                                 endpoint keeps its own cost-controlled default).
 * @returns {{
 *   provider: string, apiKey: string, baseUrl: string|null, model: string,
 *   usesSharedKey: boolean, missingKey: boolean
 * }}
 *   - usesSharedKey: true only for Anthropic with no user key (the free trial).
 *   - missingKey: true when the request can't proceed for lack of a required key
 *     (or, for the OpenAI provider, a base URL).
 */
export function resolveAiCredentials(req, anthropicModel) {
  const provider = normalizeProvider(req.body?.provider)
  const userKey = trimStr(req.body?.apiKey)

  if (provider === 'anthropic') {
    const apiKey = userKey || process.env.ANTHROPIC_API_KEY || ''
    return {
      provider,
      apiKey,
      baseUrl: null,
      // Endpoints pin their own (cheap) Anthropic model for cost control; the
      // client-sent model is ignored on this path on purpose.
      model: anthropicModel,
      usesSharedKey: !userKey,
      missingKey: !apiKey,
    }
  }

  // Gemini / OpenAI-compatible: the user MUST bring their own key — no shared
  // project fallback exists for these providers.
  const model = trimStr(req.body?.model) || PROVIDER_DEFAULT_MODEL[provider] || ''
  const baseUrl = provider === 'openai' ? trimStr(req.body?.baseUrl) : null
  const missingKey = !userKey || (provider === 'openai' && !baseUrl)
  return { provider, apiKey: userKey, baseUrl: baseUrl || null, model, usesSharedKey: false, missingKey }
}

/**
 * User-facing message for a request that can't proceed because the selected
 * provider is missing its key (or, for OpenAI-compatible, its base URL).
 */
export function missingKeyMessage(cred) {
  const label = PROVIDER_LABELS[cred?.provider] || 'your AI provider'
  if (cred?.provider === 'openai' && !cred?.baseUrl) {
    return `Add your API key and base URL for ${label} in Settings.`
  }
  return `No API key provided. Add your ${label} key in Settings.`
}

// ── Anthropic → common helpers ────────────────────────────────────────────────
export function systemToText(system) {
  if (!system) return ''
  if (typeof system === 'string') return system
  // Anthropic accepts an array of text blocks (used for prompt caching).
  if (Array.isArray(system)) return system.map(b => (typeof b === 'string' ? b : b?.text || '')).join('\n')
  return ''
}

// ── Gemini translation ────────────────────────────────────────────────────────
export function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }]
  if (!Array.isArray(content)) return [{ text: String(content ?? '') }]
  const parts = []
  for (const block of content) {
    if (!block) continue
    if (block.type === 'text') parts.push({ text: block.text || '' })
    else if (block.type === 'image' || block.type === 'document') {
      const src = block.source || {}
      if (src.data) parts.push({ inline_data: { mime_type: src.media_type || 'application/octet-stream', data: src.data } })
    }
  }
  return parts.length ? parts : [{ text: '' }]
}

function mapGeminiFinish(reason) {
  if (reason === 'MAX_TOKENS') return 'max_tokens'
  if (reason === 'STOP') return 'end_turn'
  return 'end_turn'
}

async function callGemini({ apiKey, model, system, messages, max_tokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    contents: (messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content),
    })),
    generationConfig: { maxOutputTokens: Number(max_tokens) || 2000 },
  }
  const sysText = systemToText(system)
  if (sysText) body.system_instruction = { parts: [{ text: sysText }] }

  const response = await fetch(url, {
    method: 'POST',
    // Key travels in a header, never the URL/query, so it can't leak into logs.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  })

  let data
  try { data = await response.json() } catch { return { status: response.status || 502, data: { error: 'Gemini returned invalid JSON' } } }
  if (!response.ok) {
    return { status: response.status, data: { error: data?.error?.message || `Gemini API ${response.status}` } }
  }
  const cand = data.candidates?.[0]
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('')
  return {
    status: 200,
    data: {
      content: [{ type: 'text', text }],
      stop_reason: mapGeminiFinish(cand?.finishReason),
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount,
        output_tokens: data.usageMetadata?.candidatesTokenCount,
      },
    },
  }
}

// ── OpenAI-compatible translation ─────────────────────────────────────────────
export function toOpenAIContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')
  const parts = []
  for (const block of content) {
    if (!block) continue
    if (block.type === 'text') parts.push({ type: 'text', text: block.text || '' })
    else if (block.type === 'image') {
      const src = block.source || {}
      if (src.data) parts.push({ type: 'image_url', image_url: { url: `data:${src.media_type || 'image/png'};base64,${src.data}` } })
    }
    // 'document' (PDF) has no portable OpenAI chat representation — dropped. The
    // client keeps PDF/vision-heavy flows on Claude or Gemini.
  }
  if (!parts.length) return ''
  // Collapse an all-text array back to a plain string (widest provider support).
  if (parts.every(p => p.type === 'text')) return parts.map(p => p.text).join('\n')
  return parts
}

function mapOpenAIFinish(reason) {
  if (reason === 'length') return 'max_tokens'
  return 'end_turn'
}

async function callOpenAI({ apiKey, baseUrl, model, system, messages, max_tokens }) {
  const base = (baseUrl || '').replace(/\/+$/, '')
  const endpoint = `${base}/chat/completions`
  // The base URL is user-supplied and fetched server-side — block private /
  // loopback / metadata targets so this can't be turned into an SSRF proxy.
  try {
    await assertSafeUrl(endpoint)
  } catch (e) {
    return { status: 400, data: { error: `Invalid provider URL: ${e.message}` } }
  }

  const oaMessages = []
  const sysText = systemToText(system)
  if (sysText) oaMessages.push({ role: 'system', content: sysText })
  for (const m of (messages || [])) {
    oaMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: toOpenAIContent(m.content) })
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: Number(max_tokens) || 2000, messages: oaMessages }),
  })

  let data
  try { data = await response.json() } catch { return { status: response.status || 502, data: { error: 'Provider returned invalid JSON' } } }
  if (!response.ok) {
    return { status: response.status, data: { error: data?.error?.message || data?.error || `Provider API ${response.status}` } }
  }
  const choice = data.choices?.[0]
  const text = typeof choice?.message?.content === 'string'
    ? choice.message.content
    : (Array.isArray(choice?.message?.content) ? choice.message.content.map(p => p?.text || '').join('') : '')
  return {
    status: 200,
    data: {
      content: [{ type: 'text', text }],
      stop_reason: mapOpenAIFinish(choice?.finish_reason),
      usage: {
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
      },
    },
  }
}

// ── Anthropic passthrough ─────────────────────────────────────────────────────
async function callAnthropic({ apiKey, model, system, messages, tools, tool_choice, max_tokens }) {
  const body = { model, max_tokens: Number(max_tokens) || 2000, messages }
  if (system) body.system = system
  if (tools) body.tools = tools
  if (tool_choice) body.tool_choice = tool_choice

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (response.status === 429) {
    console.warn('Claude rate limit:', {
      remaining: response.headers.get('anthropic-ratelimit-remaining-requests'),
      resetTokens: response.headers.get('anthropic-ratelimit-reset-tokens'),
    })
  }

  let data
  try { data = await response.json() } catch {
    return { status: response.status || 500, data: { error: `API returned invalid JSON: ${response.statusText}` } }
  }
  return { status: response.status, data }
}

/**
 * Send a normalized (Anthropic-shaped) request to the selected provider and get
 * an Anthropic-shaped result back: { status, data } where data on success has
 * `content: [{ type: 'text', text }]`, and on failure has `{ error }`.
 */
export async function callAiMessages({ provider, apiKey, baseUrl, model, system, messages, tools, tool_choice, max_tokens }) {
  const p = normalizeProvider(provider)
  if (p === 'gemini') return callGemini({ apiKey, model, system, messages, max_tokens })
  if (p === 'openai') return callOpenAI({ apiKey, baseUrl, model, system, messages, max_tokens })
  return callAnthropic({ apiKey, model, system, messages, tools, tool_choice, max_tokens })
}
