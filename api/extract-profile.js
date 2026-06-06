export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { cvText } = req.body
  if (!cvText) { res.status(400).json({ error: 'No CV text provided' }); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  const prompt = `Tu es un expert RH. Analyse ce CV et extrais un profil candidat structuré.

CV :
${cvText.slice(0, 6000)}

Extrais les informations suivantes en JSON. Pour chaque champ, sois précis et naturel — écris comme si le candidat se décrivait lui-même.

Règles :
- "experience" : résumé de 2-3 phrases du parcours global (secteurs, années, spécialité)
- "skills" : liste des compétences clés séparées par des virgules (max 15)
- "key_achievements" : 3-5 réalisations chiffrées ou marquantes du CV
- "companies" : liste des entreprises par ordre chronologique inverse
- "ai_experience" : extraire uniquement si le CV mentionne IA/ML/LLM/outils IA, sinon ""
- "recent_project" : projet le plus récent ou marquant, 1-2 phrases
- "motivation" : inféré du ton et des choix de carrière, 1-2 phrases
- Tous les champs en texte naturel, pas de JSON imbriqué sauf "skills", "key_achievements", "companies" qui sont des arrays

Réponds UNIQUEMENT en JSON valide sans backticks :
{
  "name": "Prénom Nom",
  "title": "Titre professionnel actuel ou visé",
  "experience": "Résumé du parcours...",
  "skills": ["compétence1", "compétence2", ...],
  "languages": "Langues parlées et niveaux",
  "education": "Formation(s) principale(s)",
  "companies": ["Entreprise1 (année-année)", ...],
  "key_achievements": ["Réalisation 1...", ...],
  "ai_experience": "...",
  "recent_project": "...",
  "motivation": "..."
}`

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
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const raw = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
    const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
    const profile = JSON.parse(start !== -1 ? raw.slice(start, end + 1) : '{}')

    // Normalise skills to string for Settings form compatibility
    const normalized = {
      ...profile,
      skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || ''),
      extractedAt: new Date().toISOString(),
    }

    res.status(200).json({ profile: normalized })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
