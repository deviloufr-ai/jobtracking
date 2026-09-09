import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'
import { resolveAiCredentials, callAiMessages, missingKeyMessage } from './_lib/aiProvider.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `parse-pdf:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

  try {
    const { base64, filename } = req.body
    if (!base64) { res.status(400).json({ error: 'No PDF data' }); return }

    // Extract text from the PDF natively. Claude and Gemini accept the base64
    // document as an inline block; an OpenAI-compatible provider can't parse a
    // PDF this way, so the adapter drops the block and the request will fail —
    // guard it with a clear message rather than sending an empty prompt.
    const cred = resolveAiCredentials(req, 'claude-haiku-4-5-20251001')
    if (cred.missingKey) { res.status(401).json({ error: missingKeyMessage(cred) }); return }
    if (cred.provider === 'openai') {
      res.status(422).json({ error: 'PDF import needs Claude or Gemini. Switch provider in Settings, or paste the CV text manually.', code: 'PDF_UNSUPPORTED_PROVIDER' })
      return
    }
    if (cred.usesSharedKey) {
      const quota = await enforceSharedKeyQuota(req)
      if (!quota.ok) { res.status(402).json({ error: 'Free trial used up. Add your own Claude API key in Settings to keep using the AI features.', code: 'TRIAL_EXHAUSTED' }); return }
    }

    const { status, data } = await callAiMessages({
      ...cred,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64
            }
          },
          {
            type: 'text',
            text: `Extrait TOUT le texte de ce CV en préservant exactement la structure : sections, titres, listes, dates, noms d'entreprises. Retourne uniquement le texte brut structuré, sans commentaires.`
          }
        ]
      }]
    })

    if (status < 200 || status >= 300) {
      throw new Error(data?.error?.message || data?.error || `AI API ${status}`)
    }

    const text = data.content?.[0]?.text || ''

    res.status(200).json({
      text,
      pages: 1,
      filename: filename || 'cv.pdf'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
