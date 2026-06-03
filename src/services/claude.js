// En dev local : appel direct impossible (CORS) → on désactive l'IA
// En prod sur Vercel : passe par /api/claude (serverless proxy)
const IS_DEV = import.meta.env.DEV
const CLAUDE_ENDPOINT = IS_DEV ? null : '/api/claude'
const MODEL = 'claude-haiku-4-5-20251001'

async function callClaude(systemPrompt, userContent) {
  if (!CLAUDE_ENDPOINT) {
    // En dev : retourne un résultat simulé pour tester l'UI
    return JSON.stringify(MOCK_PARSE_RESULT)
  }

  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Claude API error:', data)
    throw new Error(data?.error?.message || `Claude API ${res.status}`)
  }
  const text = data.content?.[0]?.text || ''
  console.log('Claude raw response:', text.slice(0, 200))
  return text
}

// Mock pour tester en dev local sans API key
const MOCK_PARSE_RESULT = [
  {
    emailId: 1,
    company: "Exemple Corp",
    position: "Product Manager",
    status: "interview",
    date: new Date().toISOString().split('T')[0],
    notes: "Mode démo — IA disponible en prod",
    confidence: 95
  }
]

export async function parseEmailsForJobs(emails) {
  if (!emails.length) return []

  if (IS_DEV) {
    // En dev, simule un résultat basé sur les vrais emails reçus
    return emails.slice(0, 3).map((e, i) => ({
      emailId: i + 1,
      company: extractCompanyFromEmail(e.from),
      position: 'Poste détecté (mode démo)',
      status: 'sent',
      date: parseEmailDate(e.date),
      notes: e.subject?.slice(0, 80) || '',
      confidence: 70
    }))
  }

  const emailsText = emails.map((e, i) =>
    `[${i + 1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${e.date}\nAperçu: ${e.snippet}`
  ).join('\n\n---\n\n')

  console.log('Sending to Claude:', emailsText.slice(0, 300))

  const system = `Tu es un assistant qui analyse des emails pour détecter des candidatures d'emploi. Tu réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre.`

  const prompt = `Analyse ces emails. Pour CHAQUE email qui concerne un emploi (candidature envoyée, réponse recruteur, entretien, refus, offre), retourne un objet JSON.

Champs requis : emailId (numéro), company (string), position (string), status ("sent"|"reviewing"|"interview"|"waiting"|"offer"|"rejected"|"cancelled"), date (YYYY-MM-DD), notes (string max 80 chars), confidence (0-100)

Règles :
- Sois très inclusif, confidence minimum 30
- Email envoyé avec CV/candidature → status "sent", company = destinataire ou mentionnée dans le corps
- Email reçu d'un ATS ou recruteur → inclure systématiquement
- Si company inconnue → utiliser le domaine de l'expéditeur
- Si position inconnue → mettre "Poste non précisé"
- Retourne [] SEULEMENT si vraiment aucun email ne concerne l'emploi

Emails:
${emailsText}`

  const raw = await callClaude(system, prompt)
  try {
    let clean = raw.trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1)
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed) ? parsed.filter(j => (j.confidence || 0) >= 20) : []
  } catch (e) {
    console.error('Parse error:', e.message, raw.slice(0, 100))
    return []
  }
}

export async function analyzeJobOffer(offerText, companyName, position) {
  if (IS_DEV) return MOCK_ANALYSIS

  const system = `Tu es un expert en recrutement. Tu réponds UNIQUEMENT en JSON valide.`
  const prompt = `Analyse cette offre d'emploi pour ${position} chez ${companyName} et retourne un JSON avec:
- summary (string), topSkills (array), positives (array), watchouts (array),
- interviewQuestions (array de {question, hint}), seniorityLevel (string), matchTips (array)

Offre: ${offerText}`

  const raw = await callClaude(system, prompt)
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch { return null }
}

export async function optimizeCV(cvText, offerText, companyName, position) {
  if (IS_DEV) return MOCK_CV_OPTIMIZATION

  const system = `Tu es un expert en rédaction de CV. Tu réponds UNIQUEMENT en JSON valide.`
  const prompt = `Compare ce CV avec cette offre pour ${position} chez ${companyName}. Retourne un JSON avec:
- matchScore (0-100), matchSummary (string), missingKeywords (array), suggestions (array de {original, improved, reason}), strengths (array)

Offre: ${offerText}
CV: ${cvText}`

  const raw = await callClaude(system, prompt)
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch { return null }
}

// Helpers
function extractCompanyFromEmail(from = '') {
  const match = from.match(/<(.+)>/)
  const email = match ? match[1] : from
  const domain = email.split('@')[1] || ''
  return domain.split('.')[0] || 'Entreprise inconnue'
}

function parseEmailDate(dateStr = '') {
  try { return new Date(dateStr).toISOString().split('T')[0] }
  catch { return new Date().toISOString().split('T')[0] }
}

const MOCK_ANALYSIS = {
  summary: "Poste de Product Manager dans une startup en croissance. Rôle transversal avec forte composante data.",
  topSkills: ["Product roadmap", "Agile/Scrum", "Data analysis", "Stakeholder management", "UX"],
  positives: ["Équipe tech de qualité", "Produit B2B avec impact réel", "Remote friendly"],
  watchouts: ["Stack legacy à moderniser", "Pas de PM lead en place", "Périmètre flou"],
  interviewQuestions: [
    { question: "Comment priorisez-vous votre backlog ?", hint: "Parlez d'ICE score ou RICE" },
    { question: "Donnez un exemple de feature que vous avez tué.", hint: "Montre ta capacité à dire non" }
  ],
  seniorityLevel: "Senior",
  matchTips: ["Mettre en avant votre expérience B2B", "Préparer un cas produit concret"]
}

const MOCK_CV_OPTIMIZATION = {
  matchScore: 78,
  matchSummary: "Bon profil avec expérience pertinente, quelques mots-clés manquants.",
  missingKeywords: ["OKR", "A/B testing", "SQL", "Product-led growth"],
  suggestions: [
    { original: "J'ai géré des projets", improved: "J'ai piloté 3 initiatives produit générant +40% de rétention", reason: "Quantifier l'impact" }
  ],
  strengths: ["Expérience internationale", "Profil technique solide", "Expérience B2C et B2B"]
}
