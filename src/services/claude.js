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

async function callClaude(systemPrompt, userContent, retries = 3) {
  if (!CLAUDE_ENDPOINT) return JSON.stringify(MOCK_PARSE_RESULT)

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    const data = await res.json()

    // Rate limit — wait and retry with exponential backoff
    if (res.status === 429) {
      const waitMs = Math.min(5000 * Math.pow(2, attempt), 30000) // 5s, 10s, 20s, 30s max
      console.warn(`Rate limit hit — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries}`)
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }

    if (!res.ok) {
      console.error('Claude API error:', data)
      throw new Error(data?.error?.message || `Claude API ${res.status}`)
    }
    const text = data.content?.[0]?.text || ''
    return text
  }
  throw new Error('Rate limit — réessaie dans quelques secondes.')
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
      const bodySection = e.body?.trim() ? `Contenu: ${e.body.slice(0, 300)}` : `Aperçu: ${e.snippet?.slice(0, 150) || ''}`
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
- "sent"      : candidature envoyée par l'utilisateur
- "reviewing" : accusé réception, profil en cours d'examen
- "interview" : invitation entretien, échange sur le process, négociation salariale, test technique proposé, questions posées
- "done"      : entretien terminé, test technique complété, discussion clôturée — en attente du résultat
- "waiting"   : en attente de décision finale
- "offer"     : proposition d'embauche formelle
- "rejected"  : refus DÉFINITIF explicite ("nous n'irons pas plus loin", "not moving forward", "not selected")
- "cancelled" : processus annulé À L'INITIATIVE DE L'ENTREPRISE (pas d'accord sur salaire ≠ annulation)

RÈGLES CRITIQUES :
- Négociation salariale en cours = "interview" (même si désaccord provisoire)
- "Processus annulé" dans une négociation = "interview" ou "waiting", PAS "cancelled" ni "rejected"
- "cancelled" uniquement si l'entreprise dit explicitement qu'elle arrête le processus
- "rejected" uniquement si l'entreprise dit explicitement qu'elle ne retient pas la candidature

Notes : max 60 chars, UNE seule info par note, concis (ex: "Test technique proposé le 08/06" pas de répétitions)

Champs JSON: emailId (entier, ex: 1 pas "[1]"), company, position, status, date (YYYY-MM-DD), notes (max 80 chars), confidence (0-100)

RÈGLE ENTREPRISE :
- L'email peut être ENVOYÉ PAR un job board mais CONCERNER une vraie entreprise — toujours extraire la vraie entreprise.
- PATTERN CLÉ Indeed/LinkedIn : le nom d'entreprise apparaît juste AVANT le pays :
  "Publidata - France" → company = "Publidata"
  "GojiberryAI · France" → company = "GojiberryAI"
  "Hublo, France" → company = "Hublo"
- Autres exemples :
  "Your application was viewed by GojiberryAI" → company = "GojiberryAI"
  "Candidature envoyée chez Publidata" → company = "Publidata"
  "You applied to Product Manager at Yeita" → company = "Yeita"
- Ne JAMAIS mettre LinkedIn / Indeed / Free-Work / Malt / WTTJ / Apec / Monster comme company.
- Si vraiment aucune entreprise identifiable : confidence: 0.

EMAILS À TRAITER AVEC CONFIDENCE 40 (mise à jour uniquement, pas nouvelle candidature) :
- "Your application was viewed" / "votre candidature a été consultée" → status: "reviewing", note: "Candidature consultée", confidence: 40
- LinkedIn "application viewed by [Company]" → même traitement
- Accusés de réception automatiques sans vrai message recruteur → confidence: 40

IGNORER ABSOLUMENT (confidence: 0) :
- Newsletters, digests, "jobs you might like", "new jobs matching", "offres recommandées"
- "Candidature suggérée" ou offre recommandée sans action de l'utilisateur
- Notifications LinkedIn "votre profil a été consulté", "X personnes ont vu votre profil" (profil, PAS candidature)
- Alertes emploi de job boards (Indeed Alert, LinkedIn Job Alert, WTTJ Newsletter...)
- Emails automatiques sans entreprise identifiable
- Emails marketing/promotionnels (publicités, newsletters de marques, promotions produits)
- Si aucun poste (position) identifiable dans l'email → confidence: 0, ne pas inventer un poste
- Si le contenu n'a aucun lien avec une candidature ou un recrutement → confidence: 0

Un email confidence >= 55 = candidature réelle (l'utilisateur A POSTULÉ ou un RECRUTEUR a répondu)
Un email confidence 35-54 = signal de suivi seulement (mise à jour d'une candidature existante)

BONUS CATÉGORIE GMAIL (si CatégGmail est présent) :
- CatégGmail: UPDATES → +10 à la confidence (email transactionnel = très probablement lié à une candidature)
- CatégGmail: PERSONAL → +5 à la confidence (contact direct = probablement un recruteur)
- CatégGmail: SOCIAL → -5 à la confidence (réseau social = souvent notification LinkedIn pas actionnable)

Emails:
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
