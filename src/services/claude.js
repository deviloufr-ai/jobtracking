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
  if (!res.ok) throw new Error('Erreur API Claude')
  const data = await res.json()
  return data.content?.[0]?.text || ''
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

  const system = `Tu es un assistant qui analyse des emails pour détecter des candidatures d'emploi.
Tu réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après, sans backticks.`

  const prompt = `Analyse ces emails et extrait les informations de candidatures.
Pour chaque email lié à une candidature retourne :
- emailId, company, position, status (sent|reviewing|interview|waiting|offer|rejected|cancelled), date (YYYY-MM-DD), notes (max 80 chars), confidence (0-100)

Règles importantes :
- Sois INCLUSIF : en cas de doute, incluis l'email avec confidence 40-60
- Un email d'une plateforme (LinkedIn, Indeed, APEC, WTTJ, Malt, ATS) est TOUJOURS lié à une candidature
- Extrais l'entreprise depuis le domaine de l'expéditeur si non mentionnée dans le sujet
- Pour les plateformes ATS (ashbyhq, greenhouse, lever, workable, teamtailor...) → status rejected si le snippet contient des mots négatifs
- Pour les emails LinkedIn/Indeed d'alertes offres → ignore (pas des candidatures)
- Pour les emails de confirmation de candidature → status "sent"
- Retourne un tableau JSON vide [] uniquement si AUCUN email n'est lié à une candidature

Emails:
${emailsText}`

  const raw = await callClaude(system, prompt)
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed) ? parsed.filter(j => j.confidence >= 50) : []
  } catch {
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
