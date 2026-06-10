import { setupCORS } from './cors-helper.js'

// Vercel Serverless Function — proxy pour l'API Anthropic (évite CORS)
export default async function handler(req, res) {
  // Setup CORS with restricted origins
  if (setupCORS(req, res)) return

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

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
    const data = await response.json()

    // Log rate limits for monitoring
    if (response.status === 429) {
      console.warn('Claude rate limit:', {
        remaining: response.headers.get('anthropic-ratelimit-remaining-requests'),
        resetTokens: response.headers.get('anthropic-ratelimit-reset-tokens'),
      })
    }

    res.status(response.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
