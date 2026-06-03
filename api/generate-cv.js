export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  const { cvText, jobDescription, company, position } = req.body
  if (!cvText || !jobDescription) {
    res.status(400).json({ error: 'cvText and jobDescription required' }); return
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Tu es un expert en rédaction de CV et recrutement. Adapte ce CV pour le poste "${position}" chez "${company}".

RÈGLES STRICTES :
1. CONSERVE EXACTEMENT la même structure, sections et titres du CV original
2. RÉÉCRIS les descriptions d'expériences pour mettre en valeur les compétences demandées dans l'offre
3. INTÈGRE les mots-clés importants de l'offre dans les expériences pertinentes
4. NE PAS inventer de nouvelles expériences ou compétences
5. REFORMULE avec des verbes d'action forts et des résultats quantifiés quand possible
6. Adapte le résumé/profil en premier paragraphe pour matcher le poste
7. Retourne le CV complet reformaté en Markdown avec les mêmes sections

CV ORIGINAL :
${cvText.slice(0, 4000)}

OFFRE D'EMPLOI (${company} - ${position}) :
${jobDescription.slice(0, 2000)}

Retourne UNIQUEMENT le CV reformaté en Markdown, sans commentaires avant ou après.`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const generatedCV = data.content?.[0]?.text || ''
    res.status(200).json({ cv: generatedCV })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
