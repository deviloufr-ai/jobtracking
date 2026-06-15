// Vercel Serverless Function — proxy pour l'API Anthropic (évite CORS)
import { applyCors, getClientIp, rateLimit } from './_lib/http.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  // Accept user's API key from request, fall back to server's if not provided
  const userKey = req.body?.apiKey?.trim()
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(401).json({ error: 'No API key provided. Please configure your Claude API key in Settings.' }); return }

  // Rate-limit requests that bill the server's shared key to prevent abuse.
  // Requests using a user-supplied key are not throttled here.
  if (!userKey) {
    const { ok, retryAfter } = rateLimit({ key: `claude:${getClientIp(req)}`, limit: 30, windowMs: 60_000 })
    if (!ok) {
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'Too many requests. Please slow down or add your own Claude API key in Settings.' })
      return
    }
  }

  try {
    const { model, max_tokens, system, messages, tools, tool_choice } = req.body
    const safeBody = { model, max_tokens, system, messages }
    if (tools) safeBody.tools = tools
    if (tool_choice) safeBody.tool_choice = tool_choice

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    })

    // Log rate limits for monitoring
    if (response.status === 429) {
      console.warn('Claude rate limit:', {
        remaining: response.headers.get('anthropic-ratelimit-remaining-requests'),
        resetTokens: response.headers.get('anthropic-ratelimit-reset-tokens'),
      })
    }

    // Parse response safely
    let data
    try {
      data = await response.json()
    } catch (e) {
      console.error('Failed to parse API response:', response.status, response.statusText)
      return res.status(response.status || 500).json({ error: `API returned invalid JSON: ${response.statusText}` })
    }

    res.status(response.status).json(data)
  } catch (err) {
    console.error('Claude proxy error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
