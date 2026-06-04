const IS_DEV = import.meta.env.DEV
const CLAUDE_ENDPOINT = IS_DEV ? null : '/api/claude'
const MODEL = 'claude-haiku-4-5-20251001'

async function callClaude(systemPrompt, userContent) {
  if (!CLAUDE_ENDPOINT) return JSON.stringify(MOCK_PARSE_RESULT)

  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
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
  console.log('Claude raw response:', text.slice(0, 300))
  return text
}

function parseJSON(raw) {
  try {
    let clean = raw.trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1)
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('Parse error:', e.message, raw.slice(0, 100))
    return []
  }
}

const MOCK_PARSE_RESULT = [
  { emailId: 1, company: 'Exemple Corp', position: 'Product Manager', status: 'interview', date: new Date().toISOString().split('T')[0], notes: 'Mode démo', confidence: 95 }
]

const system = `Tu es un assistant qui analyse des emails pour détecter des candidatures d'emploi. Tu réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre, sans backticks.`

export async function parseEmailsForJobs(emails) {
  if (!emails.length) return []

  if (IS_DEV) {
    return emails.slice(0, 3).map((e, i) => ({
      emailId: i + 1,
      company: (e.from || '').split('@')[1]?.split('.')[0] || 'Entreprise',
      position: 'Poste détecté (mode démo)',
      status: 'sent',
      date: new Date(e.date || Date.now()).toISOString().split('T')[0],
      notes: e.subject?.slice(0, 80) || '',
      confidence: 70
    }))
  }

  // Process in batches of 15
  const BATCH = 15
  const all = []
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    const emailsText = batch.map((e, j) => {
      const bodySection = e.body?.trim() ? `Contenu: ${e.body.slice(0, 500)}` : `Aperçu: ${e.snippet}`
      // Parse email date to YYYY-MM-DD
      let dateStr = e.date || ''
      try {
        const parsed = new Date(e.date)
        if (!isNaN(parsed)) dateStr = parsed.toISOString().split('T')[0]
      } catch {}
      return `[${i + j + 1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${dateStr}\n${bodySection}`
    }).join('\n\n---\n\n')

    console.log(`Batch ${i/BATCH + 1}: sending ${batch.length} emails to Claude`)

    const prompt = `Analyse ces emails. Pour CHAQUE email lié à un emploi (candidature, réponse recruteur, entretien, refus, offre), retourne un objet JSON.

Champs: emailId (numéro), company (string), position (string), status ("sent"|"reviewing"|"interview"|"waiting"|"offer"|"rejected"|"cancelled"), date (YYYY-MM-DD), notes (max 80 chars), confidence (0-100)

Règles:
- Sois inclusif, confidence min 30
- Email d'un ATS (recruitee, greenhouse, lever, workable...) → toujours inclure
- Email envoyé avec candidature → status "sent", company depuis destinataire ou corps
- Company inconnue → domaine expéditeur
- Position inconnue → "Poste non précisé"
- IGNORER : alertes d'offres d'emploi (LinkedIn job alerts, Indeed alerts, "New jobs for you", "Emplois recommandés", "X new jobs match"), newsletters, emails marketing
- IGNORER : emails sans rapport avec une candidature spécifique de l'utilisateur
- Retourne [] si vraiment aucun email emploi

Emails:
${emailsText}`

    const raw = await callClaude(system, prompt)
    const parsed = parseJSON(raw).filter(j => (j.confidence || 0) >= 20).map(j => {
      // Attach original email ID and from for linking back to Gmail
      const originalEmail = batch[j.emailId - i - 1]
      if (originalEmail) {
        j.gmailId = originalEmail.id
        j.fromEmail = originalEmail.from
        j.fromMe = originalEmail.fromMe
      }
      return j
    })
    all.push(...parsed)
  }

  return all
}

export async function analyzeJobOffer(offerText, companyName, position) {
  if (IS_DEV) return MOCK_ANALYSIS

  const prompt = `Analyse cette offre d'emploi pour ${position} chez ${companyName} et retourne un JSON avec:
- summary (string), topSkills (array), positives (array), watchouts (array),
- interviewQuestions (array de {question, hint}), seniorityLevel (string), matchTips (array)

Offre: ${offerText}`

  const raw = await callClaude(`Tu es un expert en recrutement. Réponds UNIQUEMENT en JSON valide.`, prompt)
  try {
    let clean = raw.trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start !== -1 && end !== -1) return JSON.parse(clean.slice(start, end + 1))
    return null
  } catch { return null }
}

export async function optimizeCV(cvText, offerText, companyName, position) {
  if (IS_DEV) return MOCK_CV_OPTIMIZATION

  const prompt = `Compare ce CV avec cette offre pour ${position} chez ${companyName}. Retourne un JSON avec:
- matchScore (0-100), matchSummary (string), missingKeywords (array), suggestions (array de {original, improved, reason}), strengths (array)

Offre: ${offerText}
CV: ${cvText}`

  const raw = await callClaude(`Tu es un expert en rédaction de CV. Réponds UNIQUEMENT en JSON valide.`, prompt)
  try {
    let clean = raw.trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start !== -1 && end !== -1) return JSON.parse(clean.slice(start, end + 1))
    return null
  } catch { return null }
}

function extractCompanyFromEmail(from = '') {
  const match = from.match(/<(.+)>/)
  const email = match ? match[1] : from
  const domain = email.split('@')[1] || ''
  return domain.split('.')[0] || 'Entreprise inconnue'
}

const MOCK_ANALYSIS = {
  summary: "Poste de Product Manager dans une startup en croissance.",
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
