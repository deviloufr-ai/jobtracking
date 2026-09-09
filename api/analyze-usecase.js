import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'
import { resolveAiCredentials, callAiMessages, missingKeyMessage } from './_lib/aiProvider.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `analyze-usecase:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

  try {
    const { briefText, company, position, deadline } = req.body
    if (!briefText?.trim()) { res.status(400).json({ error: 'No brief content' }); return }

    const cred = resolveAiCredentials(req, 'claude-haiku-4-5-20251001')
    if (cred.missingKey) { res.status(401).json({ error: missingKeyMessage(cred) }); return }
    if (cred.usesSharedKey) {
      const quota = await enforceSharedKeyQuota(req)
      if (!quota.ok) { res.status(402).json({ error: 'Free trial used up. Add your own Claude API key in Settings to keep using the AI features.', code: 'TRIAL_EXHAUSTED' }); return }
    }

    const deadlineStr = deadline ? `Deadline : ${deadline}` : ''
    const prompt = `Tu es un expert en recrutement et en préparation de cas pratiques.

Analyse ce cas pratique envoyé par ${company || 'un recruteur'} pour le poste de ${position || 'Product Manager'}.
${deadlineStr}

--- BRIEF ---
${briefText}
--- FIN BRIEF ---

Retourne un JSON UNIQUEMENT avec cette structure exacte :
{
  "context": "Contexte de l'entreprise/projet en 2-3 phrases",
  "objective": "Objectif principal du cas en 1-2 phrases",
  "deliverables_expected": ["livrable 1", "livrable 2", ...],
  "evaluation_criteria": [
    { "criterion": "nom du critère", "detail": "ce qu'ils évaluent concrètement" }
  ],
  "suggested_approach": [
    { "step": "Étape 1 — nom", "detail": "ce qu'il faut faire", "duration": "ex: 2h" }
  ],
  "presentation_plan": [
    { "slide": "Slide 1 — Titre", "content": "Ce qui doit y figurer" }
  ],
  "key_risks": ["piège ou point d'attention 1", "piège 2"],
  "time_estimate": "Estimation du temps total de travail"
}`

    const { status, data } = await callAiMessages({
      ...cred,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    if (status < 200 || status >= 300) {
      throw new Error(data?.error?.message || data?.error || `AI API ${status}`)
    }

    const raw = data.content?.[0]?.text || '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    res.status(200).json(parsed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
