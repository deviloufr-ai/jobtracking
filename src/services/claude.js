import { JOB_BOARD_NAMES, normalize, isJobBoard } from '../constants/jobBoards'
import { signalTrialExhausted } from './apiKey'

const IS_DEV = import.meta.env.DEV
const CLAUDE_ENDPOINT = IS_DEV ? null : '/api/claude'
const MODEL = import.meta.env.VITE_CLAUDE_MODEL || 'claude-haiku-4-5-20251001'

// Request queue to prevent cascading rate limits
let claudeRequestQueue = Promise.resolve()
let claudeRequestCount = 0
const MAX_CONCURRENT_REQUESTS = 1

// A cached result is "stale" only if it lazily put a job board as the company
// WITHOUT marking it as an intentional ATS fallback. When companyFromAts is set,
// the ATS name IS the company on purpose (ATS that hides the real employer) — keep it.
const isCachedJobBoard = result => isJobBoard(result?.company) && !result?.companyFromAts

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

// ─── ATS application-confirmation rescue ────────────────────────────────────────
// A confirmation from a recognized ATS (ashbyhq/greenhouse/lever…) or one carrying
// an unambiguous "thank you for applying / application received" phrase is a REAL
// candidature. Haiku sometimes under-scores these generic mass acknowledgements
// below the 35-confidence cutoff, so the matching "À faire" job never advances
// (Bug: a Lazer Ashby confirmation left the candidature stuck in todo forever).
// Mirrors gmail.js's fetch-time ATS detection so we can rescue at parse time.
const ATS_SENDER_DOMAINS = [
  'ashbyhq.com', 'greenhouse.io', 'lever.co', 'workable.com', 'teamtailor.com',
  'teamtailor-mail.com', 'recruitee.com', 'bamboohr.com', 'smartrecruiters.com',
  'jobvite.com', 'icims.com', 'myworkdayjobs.com', 'taleo.net', 'breezy.hr',
]
const CONFIRMATION_PHRASES = [
  'thank you for applying', 'thanks for applying', 'thank you for your application',
  'we have received your application', 'we received your application',
  "we've received your application", 'your application has been received',
  'application received', 'merci de votre candidature',
  'nous avons bien reçu votre candidature', 'bien reçu votre candidature',
  'candidature bien reçue', 'candidature enregistrée', 'candidature a bien été',
]
function isAtsConfirmationEmail(e) {
  const from = (e.from || '').toLowerCase()
  if (ATS_SENDER_DOMAINS.some(d => from.includes(d))) return true
  const hay = `${e.subject || ''} ${e.snippet || ''} ${e.body || ''}`.toLowerCase()
  return CONFIRMATION_PHRASES.some(p => hay.includes(p))
}

export function getEmailCacheStats() {
  const cache = loadEmailCache()
  const keys = Object.keys(cache)
  return { entries: keys.length, sizeKb: Math.round(JSON.stringify(cache).length / 1024) }
}
// ─────────────────────────────────────────────────────────────────────────────

// Wrap a system prompt in a cache_control block so Anthropic caches the (large,
// static) instruction prefix and only bills the variable tail on later calls.
// Only worth it when the prefix is reused (≥2 calls) — a lone call pays the
// cache-WRITE premium (~1.25× input) for no read, so callers gate on `enabled`.
function cachedSystem(text, enabled = true) {
  return enabled ? [{ type: 'text', text, cache_control: { type: 'ephemeral' } }] : text
}

async function callClaude(systemPrompt, userContent, retries = 3) {
  if (!CLAUDE_ENDPOINT) return JSON.stringify(MOCK_PARSE_RESULT)

  // Get user's API key from localStorage if available
  const userApiKey = typeof window !== 'undefined' ? localStorage.getItem('jobtrackr_claude_api_key') : null

  // Queue requests to prevent cascading rate limits
  return claudeRequestQueue = claudeRequestQueue.then(async () => {
    claudeRequestCount++
    const requestId = claudeRequestCount
    try {
      // Total timeout: 60 seconds max per request (prevent unbounded waits)
      const totalTimeoutMs = 60000
      const startTime = Date.now()
      let lastError

      for (let attempt = 0; attempt <= retries; attempt++) {
        const elapsedMs = Date.now() - startTime
        if (elapsedMs > totalTimeoutMs) {
          throw new Error(`Request timeout after ${elapsedMs}ms`)
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), totalTimeoutMs - elapsedMs)

        try {
          const body = {
            model: MODEL,
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
          }
          // Include user's API key if available
          if (userApiKey) body.apiKey = userApiKey

          const res = await fetch(CLAUDE_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          clearTimeout(timeoutId)

          let data
          try {
            data = await res.json()
          } catch (parseErr) {
            console.error(`Claude response parse error (attempt ${attempt + 1}):`, res.status, res.statusText)
            lastError = new Error(`Invalid API response (${res.status} ${res.statusText})`)
            // Retry on parse errors
            if (attempt < retries) {
              const waitMs = 1000 * Math.pow(2, attempt)
              await new Promise(r => setTimeout(r, waitMs))
              continue
            }
            throw lastError
          }

          // Shared-key free trial exhausted — surface a prompt, never retry.
          if (res.status === 402) {
            signalTrialExhausted()
            throw new Error(data?.error || 'Free trial used up — add your Claude API key in Settings to continue.')
          }

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

          // Retry on 5xx errors (transient server issues)
          if (res.status >= 500 && res.status < 600) {
            lastError = new Error(data?.error?.message || `Claude API ${res.status}`)
            if (attempt < retries) {
              const waitMs = 1000 * Math.pow(2, attempt)
              console.warn(`Claude 5xx error (${requestId}), retrying in ${waitMs}ms...`)
              await new Promise(r => setTimeout(r, waitMs))
              continue
            }
            throw lastError
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
          lastError = e
          // If this was the last attempt, throw
          if (attempt === retries) throw e
          // Otherwise, we'll retry on the next iteration
        }
      }
      throw lastError || new Error('Claude API request failed')
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

  const BATCH = 25  // ~3750 tokens/batch — still safe under 50k/min with shorter delays
  const BATCH_DELAY_MS = 1500 // 1.5s between batches → ~40 batches/min → ~62.5k tokens/min (safe margin)
  const all = []

  // Prompt caching only pays off when the big static instruction prefix is sent
  // more than once: with >1 batch, batch 1 writes the cache and the rest read it
  // ~10× cheaper. For a single batch we'd pay the cache-write premium (~1.25×)
  // with no later read, so cache only when there are multiple batches.
  const useCache = emails.length > BATCH

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
      const bodySection = e.body?.trim() ? `Contenu: ${e.body.slice(0, 1500)}` : `Aperçu: ${e.snippet?.slice(0, 250) || ''}`
      // Default to today's date if parsing fails
      let dateStr = new Date().toISOString().split('T')[0]
      try {
        if (e.date) {
          const parsed = new Date(e.date)
          if (!isNaN(parsed)) dateStr = parsed.toISOString().split('T')[0]
        }
      } catch {}
      // Include Gmail category as a confidence hint for Claude
      const catHint = e.gmailCategory === 'updates' ? 'CatégGmail: UPDATES (transactionnel — forte probabilité candidature)'
        : e.gmailCategory === 'personal' ? 'CatégGmail: PERSONAL (contact direct)'
        : e.gmailCategory === 'social' ? 'CatégGmail: SOCIAL (réseau social — vérifier si vrai recruteur)'
        : ''
      return `[${j + 1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${dateStr}${catHint ? '\n' + catHint : ''}\n${bodySection}`
    }).join('\n\n---\n\n')

    const parseInstructions = `Tu analyses des emails pour extraire des candidatures d'emploi avec HAUTE PRÉCISION.

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
5️⃣b CONFIRMATIONS ATS (l'employeur réel est DANS le corps, après le titre du poste) :
   • "Les éléments suivants ont été envoyés à [X]" → company = [X]  (confirmation Indeed)
   • "Votre candidature a été envoyée à [X]" / "Your application was sent to [X]"
   • "[X] - Remote" / "[X] · Paris" / "[X] — France" (ligne sous le titre)
   ⚠️ Indeed/LinkedIn/Jobgether = job board, JAMAIS l'employeur : cherche [X] plus bas.
6️⃣ Sujet : "Re: Candidature [POSITION] - [COMPANY]"
7️⃣ De: [firstname]@[company].com ou recruiter.company.fr
8️⃣ Si job board (Indeed/LinkedIn/WTTJ) : TOUJOURS extraire la vraie compagnie, pas le job board

🆘 FALLBACK ATS (RÈGLE IMPORTANTE) :
Certains ATS / agrégateurs (ex: Jobgether, et tout job board qui masque l'employeur)
NE FOURNISSENT PAS le nom de la vraie entreprise — seulement le poste.
DANS CE CAS UNIQUEMENT, si c'est une VRAIE candidature (tu as postulé / réponse reçue
sur un poste précis) ET qu'aucune entreprise réelle n'est trouvable après les patterns 1️⃣→8️⃣ :
  → company = le nom de l'ATS / job board (ex: "Jobgether", "Indeed", "LinkedIn")
  → companyFromAts = true
  → garder la confidence normale (NE PAS mettre 0 juste parce que l'entreprise manque)
⚠️ Ce fallback NE s'applique PAS aux newsletters / alertes / offres suggérées : celles-ci restent confidence: 0.
⚠️ Si tu trouves la vraie entreprise → utilise-la et companyFromAts = false.

EXEMPLES :
✅ "Vous avez reçu une réponse à l'offre : "Responsable Projects IT H/F" dans l'entreprise OpenSourcing" → company: "OpenSourcing", companyFromAts: false
✅ "GojiberryAI · France" → company: "GojiberryAI", companyFromAts: false
✅ "You applied to Senior Dev at Acme Corp" → company: "Acme Corp", companyFromAts: false
✅ "Your application for Product Manager was sent" (via Jobgether, aucune entreprise) → company: "Jobgether", position: "Product Manager", companyFromAts: true
❌ Ne JAMAIS mettre un job board en company SI la vraie entreprise est trouvable (companyFromAts doit rester false)

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

⚠️ CONFIRMATION ATS / ACCUSÉ DE RÉCEPTION (RÈGLE PRIORITAIRE — override le scoring) :
Un accusé de réception de candidature est TOUJOURS une VRAIE candidature, jamais du bruit.
Déclencheurs : expéditeur ATS reconnu (ashbyhq, greenhouse, lever, workable, teamtailor,
smartrecruiters, recruitee, bamboohr, jobvite, icims, workday…) OU le texte contient
"thank you for applying", "thank you for your application", "we've received your application",
"application received", "merci de votre candidature", "nous avons bien reçu votre candidature".
  → status = "reviewing" (ou "sent" si l'email confirme seulement l'envoi), confidence >= 70.
  → NE JAMAIS descendre sous 35 sous prétexte que c'est un message automatique / de masse.
  → Extraire company + position du corps : "apply for <POSTE> at <ENTREPRISE>" / "candidature <POSTE> chez <ENTREPRISE>".

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
- Position non identifiable OU
- Email = newsletter/alert/suggestion sans action réelle
- (Company non identifiable est TOLÉRÉ pour une vraie candidature via ATS → voir FALLBACK ATS : utiliser le nom de l'ATS + companyFromAts: true)

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
"Responsable Projects IT H/F" dans l'entreprise OpenSourcing
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
    "companyFromAts": false,
    "position": "...",
    "status": "...",
    "date": "YYYY-MM-DD",
    "notes": "...",
    "confidence": 0-100
  }
]`

    const userContent = `EMAILS À TRAITER :\n${emailsText}`
    const raw = await callClaude(cachedSystem(`${system}\n\n${parseInstructions}`, useCache), userContent)
    const rawParsed = parseJSON(raw)
    // Rescue recognized ATS confirmations Haiku under-scored: when it DID extract a
    // company + position but low-confidenced the acknowledgement, floor the score so
    // the signal survives the cutoff (as _updateOnly, confidence < 55) and can advance
    // the matching job. Gated on a provable confirmation so noise never gets floored.
    for (const j of rawParsed) {
      if ((j.confidence || 0) >= 35 || !j.company || !j.position) continue
      const idx = parseInt(String(j.emailId).replace(/\D/g, ''), 10) - 1
      const e = uncached[idx]
      if (e && isAtsConfirmationEmail(e)) {
        j.confidence = 45
        if (!j.status || j.status === 'todo') j.status = 'reviewing'
      }
    }
    const parsed = rawParsed.filter(j => (j.confidence || 0) >= 35).map(j => {
      // Normalize emailId: Claude sometimes returns "[1]", "1", or 1 — strip brackets and coerce
      const emailIdx = parseInt(String(j.emailId).replace(/\D/g, ''), 10) - 1
      const originalEmail = uncached[emailIdx]
      if (originalEmail) {
        j.gmailId = originalEmail.id
        j.fromEmail = originalEmail.from
        j.fromMe = originalEmail.fromMe

        // Normalize the ATS-fallback flag to a real boolean (Claude may emit "true"/1/etc.)
        j.companyFromAts = j.companyFromAts === true || j.companyFromAts === 'true'

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

// ─── ATS employer/position recovery ────────────────────────────────────────────
// Used by the ATS-candidature repair. Given a batch of emails that all collapsed
// onto a single ATS job (e.g. "Jobgether"), re-derive the EXACT position title and
// the REAL employer per email so distinct applications can be split apart again.
// Returns a map { [gmailId]: { company, companyFromAts, position, confidence } }.
const recoverSystem = `Tu analyses des emails de candidature passés par un ATS / job board (Jobgether, LinkedIn, Indeed…) qui masque souvent l'employeur réel. Tu réponds UNIQUEMENT avec un tableau JSON valide.`

export async function recoverAtsEmployers(emails) {
  if (!emails.length) return {}

  if (IS_DEV) {
    const map = {}
    emails.forEach((e, i) => {
      map[e.gmailId || e.id] = {
        company: (e.from || '').split('@')[1]?.split('.')[0] || 'Jobgether',
        companyFromAts: true,
        position: `Poste démo ${i + 1}`,
        confidence: 70,
      }
    })
    return map
  }

  const map = {}
  const BATCH = 20
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH)
    if (i > 0) await new Promise(r => setTimeout(r, 1500))

    const emailsText = batch.map((e, j) => {
      const body = (e.body?.trim() || e.snippet || '').slice(0, 4000)
      return `[${j + 1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${e.date}\nContenu: ${body}`
    }).join('\n\n---\n\n')

    const prompt = `Pour CHAQUE email [N], extrais avec HAUTE PRÉCISION :

- position : le titre EXACT du poste concerné (garder qualificatifs : "Senior", "Lead", "H/F", parenthèses…). JAMAIS inventer ni normaliser. Si aucun titre clair → position: "" et confidence: 0.

- company : la VRAIE entreprise qui recrute. CHERCHE-LA ACTIVEMENT — elle est presque toujours présente, même dans un email de confirmation Indeed/LinkedIn.
  PATTERNS PRIORITAIRES (l'employeur réel, PAS le job board) :
  • "Les éléments suivants ont été envoyés à <ENTREPRISE>" → ENTREPRISE  (confirmation Indeed)
  • "Votre candidature a été envoyée à <ENTREPRISE>" / "Your application was sent to <ENTREPRISE>"
  • "<ENTREPRISE> - Remote" / "<ENTREPRISE> · Paris" / "<ENTREPRISE> — France"  (ligne sous le titre du poste)
  • "Bonne chance !" précédé/suivi du nom de l'entreprise
  • "chez <X>", "at <X>", "for <X>", "dans l'entreprise <X>", sujet "Candidature POSTE - ENTREPRISE"
  • domaine de l'expéditeur si c'est l'entreprise (pas indeed.com / linkedin.com / jobgether.com)
  RÈGLES :
  • Indeed, LinkedIn, Jobgether, Welcome to the Jungle… sont des JOB BOARDS, JAMAIS l'employeur. Ne les mets en company QUE si aucun employeur réel n'est trouvable.
  • Si tu trouves l'employeur réel → company = cet employeur, companyFromAts: false.
  • Si (et seulement si) l'employeur réel est introuvable → company = le nom du job board d'où vient l'email (ex: "Indeed", "LinkedIn", "Jobgether" — déduit de l'expéditeur), companyFromAts: true.

- companyFromAts : true UNIQUEMENT quand l'employeur réel est introuvable. false dès qu'une vraie entreprise est trouvée.
- confidence : 0-100 selon la clarté du poste.

RÈGLE CLÉ : deux emails pour des POSTES DIFFÉRENTS sont des candidatures DIFFÉRENTES, même via le même job board. Ne fusionne jamais des postes distincts.

EXEMPLE (confirmation Indeed) :
  Sujet: "Candidature envoyée"  Contenu: "Head of Operations (évolution COO / DG) … UNIPILE - Remote … Les éléments suivants ont été envoyés à UNIPILE."
  → { "company": "UNIPILE", "companyFromAts": false, "position": "Head of Operations (évolution COO / DG)", "confidence": 95 }

RÉPONDS UNIQUEMENT avec ce tableau JSON :
[
  { "emailId": 1, "company": "...", "companyFromAts": false, "position": "...", "confidence": 0-100 }
]

EMAILS :
${emailsText}`

    let raw
    try {
      raw = await callClaude(recoverSystem, prompt)
    } catch (e) {
      console.warn('recoverAtsEmployers batch failed:', e.message)
      continue
    }

    // Local array parse (parseJSON above filters on .status which we don't emit)
    let parsed = []
    try {
      let clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '').trim()
      const start = clean.indexOf('[')
      let depth = 0, end = -1
      for (let k = start; k >= 0 && k < clean.length; k++) {
        if (clean[k] === '[') depth++
        else if (clean[k] === ']') { depth--; if (depth === 0) { end = k; break } }
      }
      if (start !== -1 && end !== -1) parsed = JSON.parse(clean.slice(start, end + 1))
    } catch (e) {
      console.warn('recoverAtsEmployers parse failed:', e.message)
    }

    for (const item of parsed) {
      if (!item || !item.position) continue
      const idx = parseInt(String(item.emailId).replace(/\D/g, ''), 10) - 1
      const src = batch[idx]
      if (!src) continue
      map[src.gmailId || src.id] = {
        company: item.company || '',
        companyFromAts: item.companyFromAts === true || item.companyFromAts === 'true',
        position: item.position,
        confidence: item.confidence ?? 0,
      }
    }
  }

  return map
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

export async function validateAndCleanJobs(parsedJobs) {
  if (!parsedJobs || parsedJobs.length === 0) {
    return { jobs: [], changelog: { merged: [], flagged: [] } }
  }

  if (IS_DEV) {
    return { jobs: parsedJobs, changelog: { merged: [], flagged: [] } }
  }

  // Format jobs for Claude review
  const jobsText = parsedJobs.map((j, i) => {
    return `[JOB-${i}] ${j.company}${j.companyFromAts ? ' (ATS fallback — pas l\'employeur réel)' : ''} / ${j.position} (${j.date})
    Status: ${j.status}, Confidence: ${j.confidence}
    Notes: ${j.notes}
    EmailId: ${j.gmailId || 'unknown'}`
  }).join('\n\n')

  const prompt = `Tu dois valider et nettoyer cette liste de candidatures d'emploi extraites d'emails.

TÂCHES À EFFECTUER :
═════════════════════════════════════════════════════════════════

1. DÉTECTER LES DOUBLONS
   - Même entreprise (normalisée) + même position (normalisée) = DOUBLON
   - Exemples de normalisations :
     * "Manutan" = "Manutan Business Technology" = "Manutan SARL"
     * "Product Manager" = "Product Manager Growth" (suffixes non-essentiels)
   - Conserver l'entrée AVEC LA PLUS HAUTE CONFIDENCE
   - Documenter quels jobs fusionner

2. FUSIONNER ENTRIES DU MÊME JOUR
   - Grouper par (company, date) SAUF pour les meetings/events
   - Fusionner les notes avec " · " si possible
   - Conserver les STATUS les plus élevés dans la hiérarchie : sent < reviewing < interview < offer
   - GARDER LES MEETINGS SÉPARÉES (source: calendar)

   Exemple :
   [JOB-0] Yubo / PM (2024-06-12) Status: sent, Notes: "Candidature envoyée"
   [JOB-1] Yubo / PM (2024-06-12) Status: reviewing, Notes: "Profil en cours"
   →  Fusionner en : Status: reviewing, Notes: "Candidature envoyée · Profil en cours"

3. SIGNALER LES ERREURS DE PARSING
   - Confidence < 50 = TRÈS SUSPECTE
   - Confidence < 40 = À IGNORER (newsletter, alerte, etc.)
   - Signaler avec raison exacte (company flou? position vague? email automatique?)

4. RETIRER LES FAUX POSITIFS
   - Newsletters / job alerts / "offres recommandées" → SUPPRIMER
   - Emails transactionnels purs sans candidature → SUPPRIMER
   - Profil consulté (pas candidature) → SUPPRIMER
   - Confidence 0 → SUPPRIMER

   ⚠️ NE JAMAIS SUPPRIMER un accusé de réception de candidature :
   "thank you for applying", "thanks for applying", "application received",
   "we received your application", "merci de votre candidature",
   "nous avons bien reçu votre candidature", "your application has been received".
   Ces emails = statut "reviewing" VALIDE (la candidature progresse) → CONSERVER.
   Ils ne sont PAS des newsletters ni des emails transactionnels purs.

   ⚠️ NE JAMAIS SUPPRIMER ni "corriger" une candidature dont company = nom d'un ATS / job
   board (ex: "Jobgether", "Indeed") quand companyFromAts = true : c'est un fallback VOULU
   (l'ATS ne fournit pas l'employeur réel). Conserver tel quel et garder companyFromAts: true.

═════════════════════════════════════════════════════════════════

JOBS À TRAITER :

${jobsText}

═════════════════════════════════════════════════════════════════

RETOURNER UN JSON VALIDE UNIQUEMENT :

{
  "cleaned_jobs": [
    {
      "job_index": 0,
      "company": "...",
      "position": "...",
      "status": "...",
      "date": "YYYY-MM-DD",
      "notes": "...",
      "confidence": 0-100,
      "gmail_ids": ["id1", "id2"],
      "_flagged_reason": null ou "raison de suspicion"
    }
  ],
  "merged": [
    {
      "primary_index": 0,
      "merged_from": [1, 2],
      "reason": "description"
    }
  ],
  "removed": [
    {
      "index": 5,
      "reason": "newsletter/false positive/low confidence"
    }
  ],
  "summary": "X jobs cleaned, Y merged, Z removed, confidence >= 50"
}`

  const raw = await callClaude(
    `Tu es un expert en validation de données. Réponds UNIQUEMENT avec le JSON demandé, sans texte supplémentaire.`,
    prompt
  )

  try {
    let clean = raw.trim()
    // Strip markdown code fences
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/, '').trim()
    const start = clean.indexOf('{')
    if (start === -1) {
      console.warn('Validation response missing JSON, returning unvalidated jobs')
      return { jobs: parsedJobs, changelog: { merged: [], flagged: [] } }
    }
    // Count braces to find matching closing }
    let depth = 0, end = -1
    for (let i = start; i < clean.length; i++) {
      if (clean[i] === '{') depth++
      else if (clean[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) {
      console.warn('Validation response missing closing brace, returning unvalidated jobs')
      return { jobs: parsedJobs, changelog: { merged: [], flagged: [] } }
    }

    const result = JSON.parse(clean.slice(start, end + 1))

    // Extract cleaned jobs and apply index mapping from original
    const cleaned = (result.cleaned_jobs || []).map(job => {
      const original = parsedJobs[job.job_index]
      if (!original) return job
      return {
        ...original,
        company: job.company || original.company,
        position: job.position || original.position,
        status: job.status || original.status,
        notes: job.notes || original.notes,
        confidence: job.confidence !== undefined ? job.confidence : original.confidence,
        gmailIds: job.gmail_ids || (original.gmailId ? [original.gmailId] : []),
        _flagged_reason: job._flagged_reason || null
      }
    })

    // Build changelog
    const changelog = {
      merged: result.merged || [],
      removed: result.removed || [],
      flagged: cleaned.filter(j => j._flagged_reason).map(j => ({
        company: j.company,
        position: j.position,
        reason: j._flagged_reason,
        confidence: j.confidence
      })),
      summary: result.summary || ''
    }

    console.log(`✓ Validation complete: ${cleaned.length} jobs retained`)
    console.log(`  Merged: ${changelog.merged.length}, Removed: ${changelog.removed.length}, Flagged: ${changelog.flagged.length}`)

    return { jobs: cleaned, changelog }
  } catch (e) {
    console.error('Validation parse error, returning unvalidated jobs:', e.message)
    console.error('Raw response preview:', raw.slice(0, 200))
    return { jobs: parsedJobs, changelog: { merged: [], flagged: [] } }
  }
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
