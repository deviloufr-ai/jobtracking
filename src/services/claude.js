import { JOB_BOARD_NAMES, normalize, isJobBoard } from '../constants/jobBoards'

const IS_DEV = import.meta.env.DEV
const CLAUDE_ENDPOINT = IS_DEV ? null : '/api/claude'
const MODEL = import.meta.env.VITE_CLAUDE_MODEL || 'claude-haiku-4-5-20251001'

// Request queue to prevent cascading rate limits
let claudeRequestQueue = Promise.resolve()
let claudeRequestCount = 0
const MAX_CONCURRENT_REQUESTS = 1

const isCachedJobBoard = result => isJobBoard(result?.company)

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
  try {
    const json = JSON.stringify(cache)
    const sizeMB = json.length / (1024 * 1024)

    // Keep cache under 4MB to avoid filling localStorage (5-10MB limit)
    if (sizeMB > 4) {
      // Delete oldest 20% of entries
      const sorted = Object.entries(cache).sort((a, b) => a[1].ts - b[1].ts)
      const toDelete = Math.ceil(sorted.length * 0.2)
      sorted.slice(0, toDelete).forEach(([key]) => delete cache[key])
    }

    localStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(cache))
  } catch {}
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

async function callClaude(systemPrompt, userContent, retries = 3) {
  if (!CLAUDE_ENDPOINT) return JSON.stringify(MOCK_PARSE_RESULT)

  // Queue requests to prevent cascading rate limits
  return claudeRequestQueue = claudeRequestQueue.then(async () => {
    claudeRequestCount++
    const requestId = claudeRequestCount
    try {
      // Total timeout: 60 seconds max per request (prevent unbounded waits)
      const totalTimeoutMs = 60000
      const startTime = Date.now()

      for (let attempt = 0; attempt <= retries; attempt++) {
        const elapsedMs = Date.now() - startTime
        if (elapsedMs > totalTimeoutMs) {
          throw new Error(`Request timeout after ${elapsedMs}ms`)
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs - elapsedMs)

        try {
          const res = await fetch(CLAUDE_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 1500,
              system: systemPrompt,
              messages: [{ role: 'user', content: userContent }],
            }),
          })
          clearTimeout(timeoutId)
          const data = await res.json()

          // Rate limit — wait and retry with exponential backoff
          if (res.status === 429) {
            const waitMs = Math.min(5000 * Math.pow(2, attempt), 30000)
            const remainingMs = totalTimeoutMs - (Date.now() - startTime)
            if (remainingMs < waitMs) {
              throw new Error('Rate limit timeout: not enough time to retry')
            }
            console.warn(`Claude rate limited (${requestId}) — waiting ${waitMs / 1000}s...`)
            await new Promise(r => setTimeout(r, waitMs))
            continue
          }

          if (!res.ok) {
            console.error('Claude API error:', data)
            throw new Error(data?.error?.message || `Claude API ${res.status}`)
          }
          const text = data.content?.[0]?.text || ''
          return text
        } catch (e) {
          clearTimeout(timeoutId)
          if (e.name === 'AbortError') {
            throw new Error(`Request aborted (timeout after ${totalTimeoutMs}ms)`)
          }
          throw e
        }
      }
      throw new Error('Rate limit — réessaie dans quelques secondes.')
    } finally {
      claudeRequestCount = Math.max(0, claudeRequestCount - 1)
    }
  })
}

function parseJSON(raw) {
  try {
    let clean = raw.trim()
    // Strip markdown code fences
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '').trim()
    const start = clean.indexOf('[')
    if (start === -1) return []
    // Walk forward counting brackets to find the matching closing ]
    let depth = 0, end = -1
    for (let i = start; i < clean.length; i++) {
      if (clean[i] === '[') depth++
      else if (clean[i] === ']') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) return []

    const parsed = JSON.parse(clean.slice(start, end + 1))

    // Validate schema: ensure all required fields are present
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => item && typeof item === 'object' && item.company && item.status)
  } catch (e) {
    console.error('Failed to parse Claude JSON response:', e.message, raw.slice(0, 100))
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

  const BATCH = 8  // ~1200 tokens/batch — safe under 50k/min rate limit with delays
  const BATCH_DELAY_MS = 3000 // 3s between batches → max ~20 batches/min → ~24k tokens/min
  const all = []

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    // Delay between batches to avoid hitting the 50k tokens/min rate limit
    if (i > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS))

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
      const bodySection = e.body?.trim() ? `Contenu: ${e.body.slice(0, 500)}` : `Aperçu: ${e.snippet?.slice(0, 250) || ''}`
      let dateStr = e.date || ''
      try {
        const parsed = new Date(e.date)
        if (!isNaN(parsed)) dateStr = parsed.toISOString().split('T')[0]
      } catch {}
      // Include Gmail category as a confidence hint for Claude
      const catHint = e.gmailCategory === 'updates' ? 'CatégGmail: UPDATES (transactionnel — forte probabilité candidature)'
        : e.gmailCategory === 'personal' ? 'CatégGmail: PERSONAL (contact direct)'
        : e.gmailCategory === 'social' ? 'CatégGmail: SOCIAL (réseau social — vérifier si vrai recruteur)'
        : ''
      return `[${j + 1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${dateStr}${catHint ? '\n' + catHint : ''}\n${bodySection}`
    }).join('\n\n---\n\n')

    const prompt = `Tu analyses des emails pour extraire des candidatures d'emploi avec HAUTE PRÉCISION.

═══════════════════════════════════════════════════════════════════════════
RÈGLES ABSOLUES STRICTES
═══════════════════════════════════════════════════════════════════════════
1. 1 email [N] = 1 objet JSON UNIQUE avec sa propre date exacte (YYYY-MM-DD)
2. Ne JAMAIS fusionner, dupliquer, ou modifier les dates
3. Extraire COMPANY et POSITION avec précision maximale (voir patterns ci-dessous)
4. STATUS = déterminé UNIQUEMENT par le contenu réel de l'email
5. CONFIDENCE = basée sur clarté + complétude, pas sur optimisme

═══════════════════════════════════════════════════════════════════════════
EXTRACTION COMPANY (PRIORITÉ ABSOLUE)
═══════════════════════════════════════════════════════════════════════════
PATTERNS À CHERCHER (dans cet ordre) :
1️⃣ Entre guillemets : "Responsable Projects IT H/F" dans l'entreprise [COMPANY] → COMPANY = [COMPANY]
2️⃣ "dans l'entreprise [X]" / "at [X]" / "for [X]" / "chez [X]"
3️⃣ "Your application was viewed by [X]"
4️⃣ "You applied to [POSITION] at [X]"
5️⃣ "[POSITION] · [X] · [Country]" (LinkedI/Indeed pattern)
6️⃣ Sujet : "Re: Candidature [POSITION] - [COMPANY]"
7️⃣ De: [firstname]@[company].com ou recruiter.company.fr
8️⃣ Si job board (Indeed/LinkedIn/WTTJ) : TOUJOURS extraire la vraie compagnie, pas le job board

EXEMPLES :
✅ "Vous avez reçu une réponse à l'offre : \"Responsable Projects IT H/F\" dans l'entreprise OpenSourcing" → company: "OpenSourcing"
✅ "GojiberryAI · France" → company: "GojiberryAI"
✅ "You applied to Senior Dev at Acme Corp" → company: "Acme Corp"
❌ Ne JAMAIS : company: "Indeed" ou "LinkedIn" ou "WTTJ"

═══════════════════════════════════════════════════════════════════════════
EXTRACTION POSITION (TRÈS PRÉCIS)
═══════════════════════════════════════════════════════════════════════════
PATTERNS À CHERCHER :
1️⃣ GUILLEMETS : "Responsable Projects IT H/F" → position: "Responsable Projects IT H/F" (EXACT)
2️⃣ Après "offre :" / "position :" / "rôle :" → extraire le titre exact
3️⃣ "You applied to [POSITION]" → [POSITION] = la position
4️⃣ "Entretien pour [POSITION]"
5️⃣ Si aucun titre clair : confidence: 0 (ne pas inventer)

RÈGLES CRITIQUES :
- "Lead Product Manager" ≠ "Product Manager" ≠ "Senior PM" (DISTINCTIONS ABSOLUES)
- Garder les qualificatifs : "Senior Developer", "Junior Designer", "H/F", "CDI", "CDD"
- JAMAIS normaliser ou abréger : "PM" → "Project Manager" (inventer), "IT Specialist" → garder exact
- Si plusieurs positions dans l'email → extraire LA PLUS SPÉCIFIQUE

EXEMPLES :
✅ "Responsable Projects IT H/F" → position: "Responsable Projects IT H/F"
✅ "Data Scientist - Paris" → position: "Data Scientist"
❌ "Senior PM" → position: "Senior Project Manager" (inventer ❌), garder "Senior PM" si c'est ce qui est écrit
❌ "IT" → confidence: 0 (trop vague)

═══════════════════════════════════════════════════════════════════════════
DÉTECTION STATUS (PRIORISER LA RÉALITÉ)
═══════════════════════════════════════════════════════════════════════════

🔴 REJECTED (refus DÉFINITIF - très strict) :
  ⚠️ CRITICAL: Vérifier qu'il n'y a PAS de "négociation salariale en cours", "entretien confirmé", "discussion processus" dans le même email

  ⚠️ CRITICAL HELLOWORK PATTERN: If email is from HelloWork and says:
  - "Réponse reçue de l'entreprise via HelloWork" + "candidature rejetée" = REJECTED
  - "Your application was studied but" = ALMOST ALWAYS REJECTED
  - If HelloWork says anything about the application being received/processed but no action → likely REJECTED

  Chercher: "ne retient pas", "n'avons pas retenu", "nous n'irons pas plus loin", "not moving forward",
  "not selected", "we regret", "not a fit", "candidature rejetée", "refus explicite", "final decision",
  "candidature rejetée définitivement", "without further discussion", "will not follow up", "n'y donnera pas suite",
  "no further", "no next steps", "application was studied but", "will not continue", "not proceeding",
  "we will not", "cannot move forward", "pas de suite", "a bien été étudiée mais", "studied but recruiter",
  "n'aviez pas été retenu", "vous n'aviez pas", "n'ont pas été retenu", "n'a pas été retenu"

  HELLOWORK SPECIAL RULE (CRITICAL - LOGIC OVERRIDE):
  If email from HelloWork says "Réponse reçue de l'entreprise" OR "Response received from company":

  CHECK FOR POSITIVE KEYWORDS:
  - "entretien", "interview", "call", "visio", "meeting", "next steps", "process suivant"
  - "interested", "intéressé", "we'd like", "nous aimerions", "pleased", "heureux"

  IF positive keywords FOUND → status: "interview" or "reviewing" with confidence 75+
  IF NO positive keywords FOUND → status: "rejected" with confidence 90

  REASON: HelloWork "response received" is binary - either positive (interview coming) or
  negative (rejection). Absence of positive signals = rejection.

  If email from HelloWork with status="reviewing" and low confidence (< 75), LIKELY ERROR.
  Re-evaluate: Does it say application was received/studied? → confidence should be higher OR status should be rejected.

  ❌ JAMAIS "rejected" si l'email contient :
  - "négociation salariale en cours" → status: "interview"
  - "entretien confirmé" + "négociation" → status: "interview"
  - "salary negotiation ongoing" → status: "interview"
  - "discussion ongoing" → status: "interview"
  - "écart salarial [discussion]" → status: "interview" si négociation continue

  Exemple CORRECT:
  "Refus implicite : écart salarial trop important" BUT ALSO "Négociation salariale en cours"
  → status: "interview" (négociation = interview, pas refus!)

  Exemple REFUSÉ:
  "Nous n'irons pas plus loin, nous avons choisi un autre candidat" → REJECTED

  Exemple HelloWork REJECTION:
  "Réponse reçue de l'entreprise via HelloWork" + "Your application was studied but..." → REJECTED (confidence 95)

🟢 OFFER (offre formelle) :
  "offer letter", "job offer", "proposition d'embauche", "nous serions ravis de vous accueillir"

🟣 INTERVIEW (rendez-vous, test, négociation - TRÈS LARGE) :
  Chercher: "Entretien", "visio", "call", "meeting", "interview", "test technique", "case study",
  "négociation salariale" (TOUJOURS interview, jamais rejected!), "questions pour vous", "process suivant",
  "next steps is...", "discussion", "échange", "entretien confirmé", "discussion salariale"

  ✅ INCLURE :
  - Toute mention de "négociation salariale" ou "salary negotiation" → INTERVIEW (not rejected!)
  - "Écart salarial [discussion]" → INTERVIEW (negotiation ongoing)
  - Invitation à discuter / "discussion process" → INTERVIEW
  - "Questions de qualification" + future actions → INTERVIEW
  - Étapes du processus proposées → INTERVIEW

🟠 DONE (entretien passé, test complété) :
  "merci de votre entretien", "suite à votre entretien", "nous avons discuté",
  "test technique complété", "entretien terminé"

🟡 WAITING (en attente passive) :
  "en attente", "on va vous recontacter", "we'll get back to you", "sans nouvelle = candidature rejetée"

🟢 REVIEWING (profil en cours d'examen) :
  "profil en cours d'examen", "application received", "merci de votre candidature",
  "we've received your application", "en cours de traitement"

📨 SENT (candidature envoyée par vous) :
  Emails du dossier SENT, ou "I am applying", "Please find my CV", "Je vous contacte"

═══════════════════════════════════════════════════════════════════════════
SCORING CONFIDENCE
═══════════════════════════════════════════════════════════════════════════
95-100 : Company CLAIR + Position CLAIRE + Status ÉVIDENT (ex: offre formelle HelloWork)
85-94  : Company CLAIR + Position CLAIRE + Status CLAIR (ex: refus d'une vraie entreprise)
75-84  : Company ou Position légèrement ambigu mais déterminable
55-74  : Mise à jour mineure (visio programmée, test reçu) OU Company/Position partiellement vague
40-54  : Notification automatique ("application viewed"), signaux très faibles
0-39   : Ignorer (job board alert, newsletter, signature profile, invitation suggérée, trop ambigu)

JAMAIS confidence > 0 si :
- Company non identifiable OU
- Position non identifiable OU
- Email = newsletter/alert/suggestion sans action réelle

═══════════════════════════════════════════════════════════════════════════
NOTES (120-150 CHARS MAX - MERGE-FRIENDLY)
═══════════════════════════════════════════════════════════════════════════
Info principale en PREMIER (sera visible après fusion), puis contexte clé
Permet de fusionner plusieurs notes du même jour avec " · " et rester lisible

✅ "Candidature envoyée, profil en cours d'examen"
✅ "Entretien confirmé 08/06 à 14h30 — visio avec Alexandre"
✅ "Test technique proposé — 2 heures, chez vous"
✅ "Refus explicite après étude de candidature"
✅ "Test technique en cours, améliorations demandées"
❌ "Email from recruiter about position" (trop vague et court)

═══════════════════════════════════════════════════════════════════════════
IGNORER ABSOLUMENT (confidence: 0)
═══════════════════════════════════════════════════════════════════════════
- Newsletters / "jobs you might like" / "offres recommandées" / "alerte emploi"
- "Votre profil a été consulté" (profil, PAS candidature)
- Marketing / promotions / publicités
- Aucune entreprise identifiable
- Aucune position identifiable
- Aucun lien avec une candidature ou un recrutement

═══════════════════════════════════════════════════════════════════════════
BONUS GMAIL CATEGORY
═══════════════════════════════════════════════════════════════════════════
+ 10 : UPDATES (transactionnel = très probablement candidature)
+ 5  : PERSONAL (contact direct = recruteur)
- 5  : SOCIAL (LinkedIn = souvent notification non-actionnable)

═══════════════════════════════════════════════════════════════════════════
EXAMPLE 1 : HelloWork Rejection - "will not follow up"
═══════════════════════════════════════════════════════════════════════════
Email:
De: emploi@emails.hellowork.com
Sujet: Vous avez reçu une réponse à l'offre
"Hello Alexandre!
You received a response to the offer:
\"Responsable Projects IT H/F\" dans l'entreprise OpenSourcing
Your application was studied but the recruiter will not follow up."

✅ CORRECT OUTPUT:
  status = "rejected" (car: "will not follow up" = refus définitif)
  notes = "Refus explicite, pas de suite donnée"
  confidence = 95

❌ WRONG: status = "reviewing" (missed "will not follow up" keyword)

═══════════════════════════════════════════════════════════════════════════
EXAMPLE 2 : Publidata Salary Negotiation (NOT REJECTED!)
═══════════════════════════════════════════════════════════════════════════
Email (simplified):
"Refus implicite : écart salarial (40-42k vs prétentions) trop important
Mais : Négociation salariale en cours
Entretien confirmé 02/06 à 14h30
Échange avec recruteur, discussion projet"

❌ WRONG: status = "rejected" (car contient "refus")
✅ CORRECT: status = "interview" (car contient "négociation salariale en cours" + "entretien confirmé")

PRIORITÉ: "négociation salariale en cours" = ALWAYS "interview", override any "refus" mention!

═══════════════════════════════════════════════════════════════════════════
OUTPUT JSON FORMAT
═══════════════════════════════════════════════════════════════════════════
[
  {
    "emailId": 1,
    "company": "...",
    "position": "...",
    "status": "...",
    "date": "YYYY-MM-DD",
    "notes": "...",
    "confidence": 0-100
  }
]

EMAILS À TRAITER :
${emailsText}`

    const raw = await callClaude(system, prompt)
    const parsed = parseJSON(raw).filter(j => (j.confidence || 0) >= 35).map(j => {
      // Normalize emailId: Claude sometimes returns "[1]", "1", or 1 — strip brackets and coerce
      const emailIdx = parseInt(String(j.emailId).replace(/\D/g, ''), 10) - 1
      const originalEmail = uncached[emailIdx]
      if (originalEmail) {
        j.gmailId = originalEmail.id
        j.fromEmail = originalEmail.from
        j.fromMe = originalEmail.fromMe

        // Tag low-confidence results — they can only update existing jobs, not create new ones
        if ((j.confidence || 0) < 55) j._updateOnly = true

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
