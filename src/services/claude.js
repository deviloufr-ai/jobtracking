const IS_DEV = import.meta.env.DEV
const CLAUDE_ENDPOINT = IS_DEV ? null : '/api/claude'
const MODEL = 'claude-haiku-4-5-20251001'

const JOB_BOARD_NAMES = new Set([
  'linkedin','indeed','welcometothejungle','wttj','apec','monster','cadremploi',
  'hellowork','freework','malt','jobteaser','glassdoor','meteojob','regionsjob',
  'keljob','poleemploi','francetravail','talentio','otta','remixjobs','remotive',
])
const normCo = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const isCachedJobBoard = result => JOB_BOARD_NAMES.has(normCo(result?.company))

// ─── Email parse cache ────────────────────────────────────────────────────────
const EMAIL_CACHE_KEY = 'jobtrackr_email_cache'
const EMAIL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

function loadEmailCache() {
  try {
    const raw = localStorage.getItem(EMAIL_CACHE_KEY)
    if (!raw) return {}
    const cache = JSON.parse(raw)
    // Evict expired entries
    const now = Date.now()
    let dirty = false
    for (const key of Object.keys(cache)) {
      if (now - cache[key].ts > EMAIL_CACHE_TTL) { delete cache[key]; dirty = true }
    }
    if (dirty) localStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(cache))
    return cache
  } catch { return {} }
}

function saveEmailCache(cache) {
  try { localStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

function emailCacheKey(email) {
  // Stable key from gmail message id + subject (no body hashing needed)
  return `${email.id || ''}_${(email.subject || '').slice(0, 60)}`
}

export function clearEmailCache() {
  localStorage.removeItem(EMAIL_CACHE_KEY)
}

export function getEmailCacheStats() {
  const cache = loadEmailCache()
  const keys = Object.keys(cache)
  return { entries: keys.length, sizeKb: Math.round(JSON.stringify(cache).length / 1024) }
}
// ─────────────────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userContent) {
  if (!CLAUDE_ENDPOINT) return JSON.stringify(MOCK_PARSE_RESULT)

  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,          // was 4000 — Haiku n'en a pas besoin
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

const system = `Tu es un assistant qui analyse des emails pour détecter des candidatures d'emploi. Tu réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre.`

export async function parseEmailsForJobs(emails) {
  if (!emails.length) return []

  if (IS_DEV) {
    return emails.slice(0, 3).map((e, i) => ({
      emailId: i + 1,
      company: (e.from || '').split('@')[1]?.split('.')[0] || 'Entreprise',
      position: 'Poste détecté (mode démo)',
      status: 'sent',
      date: (() => { try { return new Date(e.date).toISOString().split('T')[0] } catch { return new Date().toISOString().split('T')[0] } })(),
      notes: e.subject?.slice(0, 80) || '',
      confidence: 70
    }))
  }

  const cache = loadEmailCache()
  let cacheHits = 0

  const BATCH = 15
  const all = []

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)

    // Separate cached vs uncached emails in this batch
    const uncached = []
    const cachedResults = []

    for (const email of batch) {
      const key = emailCacheKey(email)
      if (cache[key] && !isCachedJobBoard(cache[key].result)) {
        cachedResults.push(cache[key].result)
        cacheHits++
      } else {
        // Force re-parse if cached result had a job board as company (stale from old prompt)
        if (cache[key]) delete cache[key]
        uncached.push(email)
      }
    }

    all.push(...cachedResults)

    if (uncached.length === 0) {
      console.log(`Batch ${Math.floor(i/BATCH) + 1}: 100% cache hit (${cacheHits} emails)`)
      continue
    }

    console.log(`Batch ${Math.floor(i/BATCH) + 1}: ${uncached.length} new emails → Claude (${cachedResults.length} from cache)`)

    const emailsText = uncached.map((e, j) => {
      const bodySection = e.body?.trim() ? `Contenu: ${e.body.slice(0, 500)}` : `Aperçu: ${e.snippet}`
      let dateStr = e.date || ''
      try {
        const parsed = new Date(e.date)
        if (!isNaN(parsed)) dateStr = parsed.toISOString().split('T')[0]
      } catch {}
      return `[${j + 1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${dateStr}\n${bodySection}`
    }).join('\n\n---\n\n')

    const prompt = `Tu analyses des emails pour extraire des candidatures d'emploi.

REGLES ABSOLUES :
1. Chaque email [N] = 1 objet JSON avec SA PROPRE date
2. La date = exactement la date du champ "Date:" converti en YYYY-MM-DD
3. Ne JAMAIS fusionner deux emails en un seul objet
4. Ne JAMAIS mettre la meme date pour deux emails differents

Correspondance date:
[1] Date: 2026-06-01 -> "date": "2026-06-01"
[2] Date: 2026-06-02 -> "date": "2026-06-02"

Statuts selon LE CONTENU de chaque email:
- "sent" : candidature envoyee par l utilisateur
- "reviewing" : accuse reception, profil en cours d examen  
- "interview" : invitation entretien, echange sur le process, negociation en cours
- "waiting" : en attente de decision
- "offer" : proposition embauche
- "rejected" : refus DEFINITIF uniquement
- "cancelled" : processus annule

IMPORTANT: Negociation salariale = "interview" ou "waiting", PAS "rejected"

Champs JSON: emailId (entier, ex: 1 pas "[1]"), company, position, status, date (YYYY-MM-DD), notes (max 80 chars), confidence (0-100)

RÈGLE ENTREPRISE : Ne JAMAIS utiliser un job board comme nom d'entreprise.
Job boards à ignorer comme "company" : LinkedIn, Indeed, Welcome to the Jungle, WTTJ, Apec, Monster, Cadremploi, Hellowork, Free-Work, Malt, Jobteaser, Glassdoor, L'Apec, Meteojob, RegionsJob, Keljob, Pole Emploi, France Travail, Talent.io, Otta, Remix Jobs, Remotive.
→ Extraire le VRAI nom de l'entreprise depuis le corps de l'email.
→ Si le vrai nom n'est pas identifiable, mettre confidence: 0 (sera ignoré).

IGNORER: alertes offres, newsletters, emails de job boards sans vrai nom d'entreprise identifiable.

Emails:
${emailsText}`

    const raw = await callClaude(system, prompt)
    const parsed = parseJSON(raw).filter(j => (j.confidence || 0) >= 20).map(j => {
      // Normalize emailId: Claude sometimes returns "[1]", "1", or 1 — strip brackets and coerce
      const emailIdx = parseInt(String(j.emailId).replace(/\D/g, ''), 10) - 1
      const originalEmail = uncached[emailIdx]
      if (originalEmail) {
        j.gmailId = originalEmail.id
        j.fromEmail = originalEmail.from
        j.fromMe = originalEmail.fromMe

        // Store in cache
        const key = emailCacheKey(originalEmail)
        cache[key] = { result: j, ts: Date.now() }
      }
      return j
    })

    all.push(...parsed)
  }

  saveEmailCache(cache)
  if (cacheHits > 0) console.log(`Cache saved ${cacheHits} Claude calls`)

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
