// Vercel Serverless Function — multi-provider AI proxy (avoids CORS, gates the
// shared-key free trial). Speaks Anthropic's Messages shape on the wire; the
// provider adapter translates to Gemini / OpenAI-compatible when the caller asks.
import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'
import { normalizeProvider, resolveAiCredentials, callAiMessages, missingKeyMessage } from './_lib/aiProvider.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const provider = normalizeProvider(req.body?.provider)
  const userKey = req.body?.apiKey?.trim()

  // ── Anthropic (default) ─────────────────────────────────────────────────────
  // The only provider with a shared project key, so it carries the free-trial
  // gate and all of its cost guards. A caller with their own key bypasses them.
  if (provider === 'anthropic') {
    const apiKey = userKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) { res.status(401).json({ error: 'No API key provided. Please configure your Claude API key in Settings.' }); return }

    // Requests using a user-supplied key are never throttled or quota-limited.
    // Shared-key requests get two guards: a per-minute burst limit AND a durable
    // per-IP trial quota (≈ one Gmail scan) before the user must add their own key.
    if (!userKey) {
      const { ok, retryAfter } = rateLimit({ key: `claude:${getClientIp(req)}`, limit: 30, windowMs: 60_000 })
      if (!ok) {
        res.setHeader('Retry-After', String(retryAfter))
        res.status(429).json({ error: 'Too many requests. Please slow down or add your own Claude API key in Settings.' })
        return
      }
      const quota = await enforceSharedKeyQuota(req)
      if (!quota.ok) {
        res.status(402).json({ error: 'Free trial used up. Add your own Claude API key in Settings to keep using the AI features.', code: 'TRIAL_EXHAUSTED' })
        return
      }
    }

    try {
      const { model, max_tokens, system, messages, tools, tool_choice } = req.body

      // When billing the shared key, also bound INPUT size — clamping max_tokens only
      // caps output, so a keyless caller could otherwise drain the owner's budget with
      // multi-MB prompts. Legit app flows (email-parse batches, scoring) stay well under.
      if (!userKey) {
        const inputSize = Buffer.byteLength(JSON.stringify({ system, messages }) || '', 'utf8')
        if (inputSize > 256 * 1024) {
          res.status(413).json({ error: 'Request too large for the free trial. Add your own Claude API key in Settings for larger requests.' })
          return
        }
      }

      // When billing the shared key, restrict cost-per-call: force an allowlisted
      // (cheap) model and clamp max_tokens. User-key requests are unrestricted.
      const SHARED_KEY_MODELS = new Set([
        'claude-haiku-4-5-20251001',
        'claude-3-5-haiku-20241022',
      ])
      const safeModel = userKey
        ? model
        : (SHARED_KEY_MODELS.has(model) ? model : 'claude-haiku-4-5-20251001')
      const safeMaxTokens = userKey
        ? max_tokens
        : Math.min(Number(max_tokens) || 2000, 4000)

      const { status, data } = await callAiMessages({
        provider: 'anthropic', apiKey, model: safeModel, max_tokens: safeMaxTokens,
        system, messages, tools, tool_choice,
      })
      res.status(status).json(data)
    } catch (err) {
      console.error('Claude proxy error:', err)
      res.status(500).json({ error: err.message || 'Internal server error' })
    }
    return
  }

  // ── Gemini / OpenAI-compatible ──────────────────────────────────────────────
  // No shared key exists for these — the user must bring their own (free-tier)
  // key, so there's no trial quota to enforce and no per-call cost clamp.
  const cred = resolveAiCredentials(req, null)
  if (cred.missingKey) {
    res.status(401).json({ error: missingKeyMessage(cred) })
    return
  }

  try {
    const { max_tokens, system, messages, tools, tool_choice } = req.body
    const { status, data } = await callAiMessages({ ...cred, system, messages, tools, tool_choice, max_tokens })
    res.status(status).json(data)
  } catch (err) {
    console.error('AI proxy error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
