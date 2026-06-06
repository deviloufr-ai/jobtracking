export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const { briefText, company, position, deadline } = req.body
    if (!briefText?.trim()) { res.status(400).json({ error: 'No brief content' }); return }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    res.status(200).json(parsed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
