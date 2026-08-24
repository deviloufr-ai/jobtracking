// JobTrackr Background Script
// v1.3.2 — Fix icon disappearing + async listener
// Cross-browser: runs as a Firefox MV2 persistent page AND a Chrome MV3 service
// worker. `importScripts` only exists in the worker, so it loads the shim that
// defines `browser` from `chrome`; Firefox already has `browser` natively.
if (typeof importScripts === 'function') {
  try { importScripts('browser-polyfill.js') } catch (e) {}
}

const DEFAULT_APP_URL = 'https://jobtracking-three.vercel.app'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

// MV2 calls it browserAction, MV3 calls it action.
const action = browser.action || browser.browserAction

// Re-set icon on startup — Firefox MV2 persistent background can lose it
action.setIcon({ path: { 48: 'icons/icon48.png' } })
action.setTitle({ title: 'JobTrackr' })

// ─── Context menu for auto-generation ────────────────────────────────────────
// Created in onInstalled: a Chrome MV3 service worker re-runs top-level code on
// every wake, and contextMenus.create throws on a duplicate id. onInstalled
// fires once per install/update in both engines.
function createContextMenu() {
  try {
    browser.contextMenus.create({
      id: 'jobtrackr-autofill',
      title: '✦ Autofill - Générer et injecter',
      contexts: ['page', 'link', 'editable']
    })
  } catch (e) {
    // Duplicate id (menu already exists) — ignore.
  }
}
// onInstalled covers first install/update (and Chrome persists the menu after);
// onStartup recreates it on browser restart, which Firefox MV2 needs because its
// session-scoped menus are cleared each start.
browser.runtime.onInstalled.addListener(createContextMenu)
browser.runtime.onStartup.addListener(createContextMenu)

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'jobtrackr-autofill') {
    browser.tabs.sendMessage(tab.id, { type: 'AUTO_GENERATE_ALL' }).catch(() => {})
  }
})

const DEFAULT_PROFILE = {
  name: '',
  email: '',
  phone: '',
  linkedin: '',
  title: '',
  experience: '',
  skills: [],
  languages: '',
  education: '',
  ai_experience: '',
  recent_project: '',
  motivation: '',
  motivation_default: ''
}

// Profil "vide" = aucun champ de fond rempli (les identités seules ne suffisent pas).
function isProfileEmpty(p) {
  if (!p) return true
  const meaningful = ['title', 'experience', 'education', 'ai_experience', 'recent_project', 'motivation']
  const hasText = meaningful.some(k => (p[k] || '').toString().trim().length > 0)
  const hasSkills = Array.isArray(p.skills) ? p.skills.length > 0 : !!(p.skills || '').toString().trim()
  return !hasText && !hasSkills
}

// ─── Listener messages ────────────────────────────────────────────────────────
// IMPORTANT Firefox MV2 : NE PAS retourner une Promise depuis onMessage.
// Ça cause "Promised response from onMessage listener went out of scope"
// quand le background event page s'endort entre deux microtasks.
// Fix : callback sendResponse + "return true" pour signaler une réponse async.
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'AUTOFILL_REQUEST') {
    handleAutofill(msg)
      .then(result => {
        try { sendResponse(result) } catch (e) {} // Ignore if listener went out of scope
      })
      .catch(err => {
        try { sendResponse({ error: err.message }) } catch (e) {}
      })
    return true  // <-- keepAlive Firefox
  }

  if (msg.type === 'GET_APP_URL') {
    browser.storage.local.get('appUrl').then(data => {
      sendResponse({ appUrl: data.appUrl || 'https://jobtracking-three.vercel.app' })
    })
    return true
  }

  // Open the app at `url`, reusing an already-open JobTrackr tab if there is one.
  if (msg.type === 'OPEN_APP_TAB') {
    openOrFocusAppTab(msg.url)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (msg.type === 'GET_PROFILE') {
    browser.storage.local.get('profile').then(data => {
      sendResponse({ profile: data.profile || DEFAULT_PROFILE })
    })
    return true
  }

  if (msg.type === 'SAVE_PROFILE') {
    browser.storage.local.set({ profile: msg.profile }).then(() => {
      sendResponse({ success: true })
    })
    return true
  }

  // ── Sync from JobTrackr app ──
  if (msg.type === 'SYNC_FROM_APP') {
    syncFromApp()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }))
    return true
  }

  // ── JD persistence ──
  if (msg.type === 'SAVE_JD') {
    browser.storage.local.set({ [msg.key]: msg.text })
      .then(() => cleanupOldJDs())
      .then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'LOAD_JD') {
    browser.storage.local.get(msg.key).then(data => {
      const text = data[msg.key] || ''
      sendResponse({ text })
    })
    return true
  }

  // ── CV↔job match score (for the on-page floating pill) ──
  // The content script asks us to score the current job against the synced CV.
  // We do it here (not in the content script) so the pill can appear without the
  // popup being open, and so the Claude key + JD fallback live in one place. The
  // cache key matches popup.js exactly, so a score computed by either side is
  // reused by the other with no second Claude call.
  if (msg.type === 'COMPUTE_SCORE') {
    computeMatchScore(msg)
      .then(result => { try { sendResponse(result) } catch (e) {} })
      .catch(err => { try { sendResponse({ error: err.message }) } catch (e) {} })
    return true
  }

  // ── Add the job to JobTrackr (from the pill's "Ajouter" button) ──
  if (msg.type === 'ADD_JOB') {
    addJobToTracker(msg.job)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }

  // ── Is the current page already tracked in JobTrackr? (for the score pill) ──
  // Answers from the cached applied-jobs list, opportunistically refreshed from
  // an open JobTrackr tab so it reflects the user's real list.
  if (msg.type === 'CHECK_APPLIED') {
    checkApplied(msg)
      .then(result => { try { sendResponse(result) } catch (e) {} })
      .catch(() => { try { sendResponse({ applied: false }) } catch (e) {} })
    return true
  }

  // ── Remember a job the extension just added, so the pill flags it instantly
  // without waiting for the next sync/app-tab read. ──
  if (msg.type === 'RECORD_APPLIED') {
    recordAppliedJob(msg.job)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }

  // ── Batch-score a listing page's cards against the synced CV (one Claude call) ──
  if (msg.type === 'SCAN_SCORE') {
    scanScoreCards(msg)
      .then(result => { try { sendResponse(result) } catch (e) {} })
      .catch(err => { try { sendResponse({ error: err.message }) } catch (e) {} })
    return true
  }

  // ── Batch-add the offers selected in the listing-scan panel ──
  if (msg.type === 'ADD_JOB_BATCH') {
    addJobBatch(msg.jobs)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }

  // ── Hand the app the selected-jobs array for a batchKey (batch import bridge) ──
  if (msg.type === 'LOAD_BATCH') {
    browser.storage.local.get(msg.key).then(data => {
      const jobs = Array.isArray(data[msg.key]) ? data[msg.key] : []
      sendResponse({ jobs })
    })
    return true
  }
})

// ─── Cleanup stale JD entries ────────────────────────────────────────────────
// Each import writes a `jd-<timestamp>` key into storage.local that was never
// removed, growing unbounded. Sweep entries older than 7 days on each save.
async function cleanupOldJDs() {
  try {
    const all = await browser.storage.local.get(null)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const stale = Object.keys(all).filter(k => {
      const m = /^jd-(\d+)$/.exec(k)
      return m && Number(m[1]) < cutoff
    })
    if (stale.length) await browser.storage.local.remove(stale)
  } catch (e) {
    // Non-critical — ignore cleanup failures
  }
}

// ─── Open / focus the JobTrackr app tab ──────────────────────────────────────
// Reuses an existing tab on the app's origin instead of spawning a new one each
// time a job is added. Navigates it to `url` (carrying the ?add=… params) and
// brings its window to the front; falls back to creating a tab if none is open.
async function openOrFocusAppTab(url) {
  const { appUrl } = await browser.storage.local.get('appUrl')
  const base = appUrl || 'https://jobtracking-three.vercel.app'
  const tabs = await browser.tabs.query({})
  const existing = tabs.find(t => t.url && t.url.startsWith(base))
  if (existing) {
    await browser.tabs.update(existing.id, { url, active: true })
    try { await browser.windows.update(existing.windowId, { focused: true }) } catch {}
  } else {
    await browser.tabs.create({ url })
  }
}

// ─── Cross-browser file injection ────────────────────────────────────────────
// MV3 (Chrome) exposes scripting.executeScript and wraps the script's return
// value in { result }; MV2 (Firefox) uses tabs.executeScript and returns the
// raw value. Normalise both to the injected script's return value.
async function injectFile(tabId, file) {
  if (browser.scripting?.executeScript) {
    const res = await browser.scripting.executeScript({ target: { tabId }, files: [file] })
    return res?.[0]?.result
  }
  const res = await browser.tabs.executeScript(tabId, { file })
  return res?.[0]
}

// ─── Sync from JobTrackr app ─────────────────────────────────────────────────
async function syncFromApp() {
  const { appUrl } = await browser.storage.local.get('appUrl')
  const targetUrl = appUrl || 'https://jobtracking-three.vercel.app'

  // Find an open tab on the JobTrackr app
  const tabs = await browser.tabs.query({})
  let appTab = tabs.find(t => t.url && t.url.startsWith(targetUrl))

  // If not open, create a temporary tab
  let tempTab = false
  if (!appTab) {
    appTab = await browser.tabs.create({ url: targetUrl, active: false })
    tempTab = true
    // Wait for the tab to load
    await new Promise(resolve => {
      const listener = (tabId, info) => {
        if (tabId === appTab.id && info.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener)
          resolve()
        }
      }
      browser.tabs.onUpdated.addListener(listener)
      setTimeout(resolve, 5000) // fallback timeout
    })
  }

  let result = { synced: false }
  try {
    result = (await injectFile(appTab.id, 'sync.js')) || { synced: false }
    // While we have the app tab, also refresh the tracked-jobs cache used by the
    // score pill's "already applied" badge. Best-effort — never fail the sync.
    try {
      const jobsRes = await injectFile(appTab.id, 'read-jobs.js')
      if (jobsRes && jobsRes.ok && Array.isArray(jobsRes.jobs)) {
        await setAppliedJobsFromApp(jobsRes.jobs)
      }
    } catch (e) {}
  } finally {
    if (tempTab) await browser.tabs.remove(appTab.id)
  }

  if (result.synced) {
    const toSave = {}
    if (result.profile) toSave.profile = result.profile
    if (result.cvText)  { toSave.cvText = result.cvText; toSave.cvName = result.cvName }
    if (result.apiKey)  toSave.apiKey = result.apiKey
    if (Object.keys(toSave).length > 0) {
      await browser.storage.local.set(toSave)
    }
    return { success: true, hasProfile: !!result.profile, hasCv: !!result.cvText, cvName: result.cvName, hasApiKey: !!result.apiKey }
  }

  return { success: false, error: result.error || 'Aucune donnée trouvée dans JobTrackr' }
}

// ─── Autofill handler ────────────────────────────────────────────────────────
async function handleAutofill(msg) {
  const { fields, jobContext } = msg

  let [storedProfile, storedCvText] = await Promise.all([
    browser.storage.local.get('profile').then(d => d.profile || DEFAULT_PROFILE),
    browser.storage.local.get('cvText').then(d => d.cvText || null)
  ])

  // Auto-sync : si on n'a aucune donnée candidat, tente de récupérer CV + profil
  // depuis l'app JobTrackr avant de générer (sinon Claude écrit dans le vide).
  if (!storedCvText && isProfileEmpty(storedProfile)) {
    try {
      const sync = await syncFromApp()
      if (sync && sync.success) {
        const refreshed = await browser.storage.local.get(['profile', 'cvText'])
        storedProfile = refreshed.profile || storedProfile
        storedCvText = refreshed.cvText || storedCvText
      }
    } catch (e) {
      // Sync best-effort : on continue même si elle échoue
    }
  }

  try {
    const answers = await callClaude(fields, jobContext, storedProfile, storedCvText)
    return { success: true, answers }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── Shared Claude API helper with timeout ───────────────────────────────────
// Routes through the JobTrackr proxy (/api/claude) which holds the shared
// ANTHROPIC_API_KEY server-side. Users no longer need to supply their own key.
async function callClaudeAPI(messages, maxTokens = 2000, timeoutMs = 10000) {
  const { appUrl, apiKey } = await browser.storage.local.get(['appUrl', 'apiKey'])
  const targetUrl = appUrl || DEFAULT_APP_URL

  // No key → shared JobTrackr key (free trial, quota-capped). Key present →
  // forwarded so the proxy treats the call as unlimited.
  const payload = { model: CLAUDE_MODEL, max_tokens: maxTokens, messages }
  if (apiKey) payload.apiKey = apiKey

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${targetUrl}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Claude API ${res.status}: ${err.error?.message || err.error || res.statusText}`)
    }

    return await res.json()
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`API request timeout after ${timeoutMs}ms`)
    }
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Appel Claude API ─────────────────────────────────────────────────────────
async function callClaude(fields, jobContext, profile, cvText = null) {
  const fieldsText = fields.map((f, i) => {
    const control = f.control || 'text'
    const head = `Champ ${i}: "${f.label}"`
    const opts = Array.isArray(f.options) ? f.options : []
    if ((control === 'select' || control === 'combobox') && opts.length) {
      return `${head} [SELECT — répondre / answer EXACTEMENT une option: ${JSON.stringify(opts)}]`
    }
    if (control === 'radio' && opts.length) {
      return `${head} [RADIO — répondre / answer EXACTEMENT une option: ${JSON.stringify(opts)}]`
    }
    if (control === 'checkbox') {
      return `${head} [CHECKBOX — répondre / answer "yes" ou "no"]`
    }
    return `${head}${f.maxLength ? ` (max ${f.maxLength} chars)` : ''}`
  }).join('\n')

  // Projet phare — toujours injecté, quelle que soit la source (CV ou champs).
  // C'est l'exemple à privilégier pour les questions "application IA marquante",
  // "projet récent", "ce qui te rend unique", etc.
  const starProject = [
    profile.recent_project ? `Projet phare: ${profile.recent_project}` : '',
    profile.ai_experience ? `Expérience IA: ${profile.ai_experience}` : ''
  ].filter(Boolean).join('\n')

  // Build profile section — prefer full CV text if available, fallback to profile fields
  let profileText
  if (cvText) {
    profileText = [
      `Nom: ${profile.name || ''}`,
      `Titre: ${profile.title || ''}`,
      `Langues: ${profile.languages || ''}`,
      starProject,
      '',
      '## CV complet (source principale — utilise ces informations en priorité)',
      cvText.slice(0, 16000)
    ].filter(Boolean).join('\n')
  } else {
    const skillsText = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '')
    profileText = [
      `Nom: ${profile.name}`,
      `Titre: ${profile.title}`,
      `Expérience: ${profile.experience}`,
      `Compétences: ${skillsText}`,
      `Langues: ${profile.languages}`,
      `Formation: ${profile.education}`,
      `Expérience IA: ${profile.ai_experience}`,
      `Projet récent: ${profile.recent_project}`,
      `Motivation: ${profile.motivation || profile.motivation_default || ''}`
    ].join('\n')
  }

  const hasMotivation = fields.some(f => /lettre.*motiv|cover.?letter|motivation|pourquoi.*nous|why.*join|why.*apply/i.test(f.label))

  // Detect language from job context (EN if mostly English signals)
  const enSignals = ['the ', ' and ', ' of ', ' for ', 'team', 'experience', 'requirements', 'skills', 'join', 'role', 'position', 'seeking', 'looking']
  const ctx = (jobContext || '').toLowerCase()
  const enScore = enSignals.filter(s => ctx.includes(s)).length
  const isEnglish = enScore >= 4

  const motivationGuidance = hasMotivation ? (isEnglish ? `
## Cover letter guidelines (apply strictly)
- Strong opening: start with a sentence showing you know the company or sector — never "I am writing to apply" or "Your offer caught my attention"
- Real personalization: cite one concrete element about the company (product, news, mission, value) that resonates with the candidate's background
- Direct link to the role: connect 2-3 key skills from the posting to concrete candidate achievements (numbers, projects, contexts)
- Concrete value-add: show what the candidate brings to this specific role, not just what they are looking for
- Direct, human tone: active voice, no HR jargon, no hollow phrases — as if speaking to a senior colleague
- Ideal length: 150 to 250 words maximum, no formatting (no lists, no headings)
- Actionable close: one short final sentence showing availability and eagerness to connect
` : `
## Conseils pour la lettre de motivation (applique-les impérativement)
- Accroche percutante : commence par une phrase qui montre que tu connais l'entreprise ou le secteur — jamais "Je me permets de vous écrire" ni "Votre offre a retenu mon attention"
- Personnalisation réelle : cite un élément concret de l'entreprise (produit, actualité, mission, valeur) qui résonne avec le parcours du candidat
- Lien direct avec l'offre : relie 2-3 compétences clés de l'annonce à des réalisations concrètes du candidat (chiffres, projets, contextes)
- Apport concret : montre ce que le candidat apporte à ce rôle spécifique, pas juste ce qu'il cherche
- Ton direct et humain : actif, sans jargon RH, sans formules creuses — comme si on parlait à un collègue senior
- Longueur idéale : 150 à 250 mots maximum, pas de mise en forme (pas de listes, pas de titres)
- Clôture actionnable : une phrase finale courte montrant la disponibilité et l'envie d'échanger
`) : ''

  const prompt = isEnglish
    ? `You are helping a senior candidate fill out a job application form.
Generate authentic, direct and human answers — as if the candidate wrote them personally.

## Candidate profile
${profileText}

## Job context
${jobContext || 'Senior PM/PO role — adapt answers accordingly.'}

## Fields to fill
${fieldsText}
${motivationGuidance}
## Content rules
- Reply ONLY in JSON: {"answers": [{"fieldIndex": 0, "text": "..."}, ...]}
- fieldIndex starts at 0 (not 1)
- [SELECT] / [RADIO] fields: "text" MUST be EXACTLY one of the listed options, copied verbatim. Never invent free text for these.
- [CHECKBOX] fields: "text" is "yes" or "no". Only answer "yes" for a consent/GDPR box when it is clearly required and harmless.
- If a field cannot be answered reliably (missing info, ambiguous choice, file upload): return "text": "" so a human handles it.
- Match the language of each label (EN if EN label, FR if FR label)
- **IF "Contexte spécifique du candidat pour ce champ" is provided, MUST incorporate it into the answer**
- For "Full Name" / "Email" / "LinkedIn": copy exactly from the profile
- For "what makes X special": show real product/company knowledge, be specific
- For "why join": connect the role to the candidate's concrete experience
- For "AI experience": use the candidate's AI profile (JobTrackr, Claude API, ComfyUI)
- For "most interesting/exciting AI application", "recent project", "proudest work", "an AI product you used/built": lead with the candidate's "Projet phare" (star project) and describe it concretely (what it does, the AI used, the impact). Never give a generic example when a star project is provided.

## Style rules — MANDATORY, NO EXCEPTIONS
- ABSOLUTELY FORBIDDEN: em dash character (—). Replace with a comma, period, or rephrase.
- ABSOLUTELY FORBIDDEN: … (ellipsis). Use a period or remove.
- ABSOLUTELY FORBIDDEN: bullet points, list hyphens, numbering.
- ABSOLUTELY FORBIDDEN: "As a", "With X years of", "I am confident that", "Please don't hesitate".
- Short, active, natural sentences. 2 to 3 sentences max per field except cover letter.
- Vary sentence openings, never start two answers the same way.
- Text must sound written by a competent human, not an AI assistant.

## Output format
Pure JSON only, no markdown, no backticks`
    : `Tu aides un candidat senior à remplir un formulaire de candidature.
Génère des réponses authentiques, directes et humaines — comme si le candidat les écrivait lui-même.

## Profil candidat
${profileText}

## Contexte de l'offre
${jobContext || 'Poste de PM/PO senior — adapte les réponses en conséquence.'}

## Champs à remplir
${fieldsText}
${motivationGuidance}
## Règles de fond
- Réponds UNIQUEMENT en JSON : {"answers": [{"fieldIndex": 0, "text": "..."}, ...]}
- fieldIndex commence à 0 (pas à 1)
- Champs [SELECT] / [RADIO] : "text" DOIT être EXACTEMENT une des options listées, copiée mot pour mot. Jamais de texte libre inventé.
- Champs [CHECKBOX] : "text" vaut "yes" ou "no". Ne réponds "yes" pour un consentement/RGPD que si c'est clairement requis et sans risque.
- Si un champ ne peut pas être rempli de façon fiable (info manquante, choix ambigu, upload de fichier) : renvoie "text": "" pour qu'un humain s'en charge.
- Adapte la langue au label (FR si FR, EN si EN)
- **SI "Contexte spécifique du candidat pour ce champ" est fourni, DOIT l'intégrer dans la réponse**
- Pour "Full Name" / "Email" / "LinkedIn" : copie exactement la valeur du profil
- Pour "what makes X special" : montre une vraie connaissance produit/entreprise, sois précis
- Pour "why join" : relie l'offre à l'expérience concrète du candidat
- Pour "AI experience" : utilise le profil IA du candidat (JobTrackr, Claude API, ComfyUI)
- Pour "application IA la plus marquante/excitante", "projet récent", "projet dont tu es le plus fier", "un produit IA que tu as utilisé/construit" : pars du "Projet phare" du candidat et décris-le concrètement (ce qu'il fait, l'IA utilisée, l'impact). Ne donne jamais un exemple générique si un projet phare est fourni.

## Règles de style — OBLIGATOIRES, SANS EXCEPTION
- INTERDIT ABSOLU : le caractère — (tiret long, em dash U+2014). Remplace-le par une virgule, un point, ou reformule.
- INTERDIT ABSOLU : … (points de suspension). Utilise un point ou supprime.
- INTERDIT ABSOLU : les bullet points, tirets de liste, numérotation.
- INTERDIT ABSOLU : "En tant que", "Fort de X années", "Je suis convaincu que", "Je me permets", "N'hésitez pas".
- Phrases courtes, actives, naturelles. 2 à 3 phrases max par champ sauf lettre de motivation.
- Varie les débuts de phrases, ne commence jamais deux réponses de la même façon.
- Le texte doit sonner comme écrit par un humain compétent, pas par un assistant IA.

## Format de sortie
JSON pur uniquement, sans markdown, sans backticks`

  // Whole form in one call now — give it more room and a longer timeout than
  // the old one-field-at-a-time path.
  const data = await callClaudeAPI([{ role: 'user', content: prompt }], 3000, 20000)

  const raw = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(raw)
  const answers = parsed.answers || []
  // Post-process: strip forbidden punctuation that Claude still sneaks in
  return answers.map(a => ({
    ...a,
    text: (a.text || '')
      .replace(/\s*—\s*/g, ', ')   // em dash → comma
      .replace(/–/g, '-')           // en dash → hyphen
      .replace(/…/g, '.')           // ellipsis → period
      .replace(/\s+\./g, '.')       // trailing space before period
      .trim()
  }))
}

// ─── CV↔job match score ──────────────────────────────────────────────────────
// Small stable content hash (djb2) — same algo as popup.js so cache keys match.
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Server-side JD fetch fallback (same endpoint the popup uses) for when the
// content script couldn't read a usable description from the DOM.
async function fetchJdFromServer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return ''
  try {
    const { appUrl } = await browser.storage.local.get('appUrl')
    const base = appUrl || DEFAULT_APP_URL
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)
    const res = await fetch(`${base}/api/fetch-jd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!res.ok) return ''
    const data = await res.json()
    return (data?.text || '').trim()
  } catch (e) {
    return ''
  }
}

// Drop cached scores older than 30 days so storage doesn't grow unbounded.
async function pruneScoreCache() {
  try {
    const all = await browser.storage.local.get(null)
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const stale = Object.keys(all).filter(k => k.startsWith('score:') && (all[k]?._ts || 0) < cutoff)
    if (stale.length) await browser.storage.local.remove(stale)
  } catch (e) {}
}

// Score how well the synced CV matches a job. Returns the parsed result (cached
// per URL+CV), or a status object: { noCv } / { insufficient } when it can't run.
async function computeMatchScore({ company, position, description, url, force }) {
  const { cvText } = await browser.storage.local.get('cvText')
  if (!cvText) return { noCv: true }

  let jobDesc = (description || '').trim()
  // Thin DOM description → try the server fetch the web app uses.
  if (jobDesc.length < 120 && url) {
    const server = await fetchJdFromServer(url)
    if (server.length > jobDesc.length) jobDesc = server
  }
  if (!company || !position || jobDesc.length < 80) return { insufficient: true }

  // Cache key identical to popup.js so both sides share one cache entry.
  const cacheKey = 'score:' + djb2([
    url || `${company}|${position}|${djb2(jobDesc)}`,
    djb2(cvText)
  ].join('|'))

  if (!force) {
    const cached = (await browser.storage.local.get(cacheKey))[cacheKey]
    if (cached) return cached
  }

  const prompt = `You are an expert recruiter and CV screener. Analyze how well the candidate's CV matches the job description.

CANDIDATE CV:
${cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDesc}

Evaluate the candidate's fit across these dimensions:
1. Required Skills Match (must-have technical/soft skills from JD)
2. Experience Level (years, seniority, relevant domain)
3. Background Alignment (industry, company size, role similarity)
4. Achievement Relevance (measurable outcomes matching JD context)

Respond with ONLY a JSON object (no markdown, no preamble) with this exact structure:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence assessment>",
  "strengths": ["<key strength>", "<key strength>"],
  "gaps": ["<missing skill/experience>", "<gap>"],
  "verdict": "<STRONG_MATCH|GOOD_MATCH|PARTIAL_MATCH|WEAK_MATCH>"
}`

  const data = await callClaudeAPI([{ role: 'user', content: prompt }], 1000, 12000)
  const text = data.content?.[0]?.text || '{}'
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const result = JSON.parse(start !== -1 ? text.slice(start, end + 1) : '{}')

  const record = { ...result, _ts: Date.now() }
  browser.storage.local.set({ [cacheKey]: record })
  pruneScoreCache()
  return record
}

// ─── Listing-page batch scoring ──────────────────────────────────────────────
// Score a whole page of listing cards against the synced CV in ONE Claude call
// (card-level fields only — the full JD isn't available on a search page). Also
// flags each card that's already tracked, from the applied-jobs cache. Returns
// { results: [{ ...card, score, verdict, reason, applied, appliedStatus }] } or
// { noCv } when there's no CV/profile to match against.
async function scanScoreCards({ cards }) {
  let { cvText, profile } = await browser.storage.local.get(['cvText', 'profile'])
  // Nothing to match against → try one sync from an open/temp app tab.
  if (!cvText && isProfileEmpty(profile)) {
    try {
      const sync = await syncFromApp()
      if (sync && sync.success) {
        const r = await browser.storage.local.get(['cvText', 'profile'])
        cvText = r.cvText; profile = r.profile
      }
    } catch (e) {}
  }
  if (!cvText && isProfileEmpty(profile)) return { noCv: true }

  const list = (Array.isArray(cards) ? cards : []).slice(0, 25)
  if (!list.length) return { results: [] }

  const p = profile || {}
  const skills = Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || '')
  const candidate = cvText
    ? `CANDIDATE CV:\n${cvText.slice(0, 4000)}`
    : `CANDIDATE PROFILE:\nRole: ${p.title || ''}\nExperience: ${p.experience || ''}\nSkills: ${skills}\nLanguages: ${p.languages || ''}`

  const jobsBlock = list.map((c, i) =>
    `[${i}] ${c.title || ''} — ${c.company || ''}${c.location ? ' — ' + c.location : ''}${c.snippet ? '\n' + String(c.snippet).slice(0, 300) : ''}`
  ).join('\n\n')

  const prompt = `You are an expert recruiter screening a candidate against a list of job postings taken from a search-results page. For each posting, judge how well it fits the candidate based on role, seniority, skills and domain.

${candidate}

JOB POSTINGS:
${jobsBlock}

Respond with ONLY a JSON object (no markdown, no preamble), one entry per posting index:
{"results":[{"i":<index>,"score":<0-100>,"verdict":"<STRONG_MATCH|GOOD_MATCH|PARTIAL_MATCH|WEAK_MATCH>","reason":"<max 12 words, in French>"}]}`

  let scores = new Map()
  try {
    const data = await callClaudeAPI([{ role: 'user', content: prompt }], 1500, 20000)
    const text = data.content?.[0]?.text || '{}'
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    const parsed = JSON.parse(start !== -1 ? text.slice(start, end + 1) : '{}')
    scores = new Map((parsed.results || []).map(r => [r.i, r]))
  } catch (e) {
    // Scoring failed — still return the cards (unscored) so the user can add them.
  }

  const applied = await getAppliedList().catch(() => [])
  const results = list.map((c, i) => {
    const r = scores.get(i) || {}
    const m = matchApplied(applied, c)
    return {
      ...c,
      score: typeof r.score === 'number' ? Math.round(r.score) : null,
      verdict: r.verdict || '',
      reason: r.reason || '',
      applied: !!m,
      appliedStatus: m ? (m.status || '') : ''
    }
  })
  return { results }
}

// Add a job to JobTrackr — stores the JD, then opens/focuses the app tab with the
// import params (mirrors the popup's "Ajouter à JobTrackr" flow).
async function addJobToTracker(job = {}) {
  const { appUrl } = await browser.storage.local.get('appUrl')
  const base = appUrl || DEFAULT_APP_URL
  const jdKey = `jd-${Date.now()}`
  await browser.storage.local.set({ [jdKey]: job.description || '' })
  const todayStr = new Date().toISOString().split('T')[0]
  const date = job.date || todayStr
  const dateParam = date === todayStr ? new Date().toISOString() : date
  const params = new URLSearchParams({
    add: '1',
    company: job.company || '',
    position: job.position || '',
    status: job.status || 'todo',
    date: dateParam,
    url: job.url || '',
    jdKey
  })
  // Flag it locally right away so the score pill shows "already applied" even
  // before the user next syncs.
  await recordAppliedJob({ ...job, status: job.status || 'todo', date })
  await openOrFocusAppTab(`${base}?${params.toString()}`)
}

// Sweep consumed `scan-batch-<ts>` entries (the app reads them right after the
// tab opens, so anything older than an hour is stale).
async function cleanupOldBatches() {
  try {
    const all = await browser.storage.local.get(null)
    const cutoff = Date.now() - 60 * 60 * 1000
    const stale = Object.keys(all).filter(k => {
      const m = /^scan-batch-(\d+)$/.exec(k)
      return m && Number(m[1]) < cutoff
    })
    if (stale.length) await browser.storage.local.remove(stale)
  } catch (e) {}
}

// Batch-add the offers selected in the listing-scan panel. Stores the array under
// a `scan-batch-<ts>` key and opens the app once at ?addBatch=1&batchKey=… — the
// app pulls the array back via the jobtrackr-batch-request bridge and imports each
// (its own findDuplicate skips doublons). One tab, not one per job.
async function addJobBatch(jobs = []) {
  const payload = (Array.isArray(jobs) ? jobs : [])
    .map(j => ({
      company: j.company || '',
      position: j.position || j.title || '',
      url: j.url || '',
      status: 'todo',
      date: new Date().toISOString(),
      description: j.snippet || j.description || ''
    }))
    .filter(j => j.position || j.company)
    .slice(0, 25)
  if (!payload.length) return { ok: false, error: 'Aucune offre sélectionnée' }

  const { appUrl } = await browser.storage.local.get('appUrl')
  const base = appUrl || DEFAULT_APP_URL
  const batchKey = `scan-batch-${Date.now()}`
  await browser.storage.local.set({ [batchKey]: payload })
  cleanupOldBatches()
  // Flag them locally so the score pill shows "already tracked" right away.
  for (const j of payload) { try { await recordAppliedJob(j) } catch (e) {} }
  await openOrFocusAppTab(`${base}?${new URLSearchParams({ addBatch: '1', batchKey }).toString()}`)
  return { ok: true, count: payload.length }
}

// ─── "Already applied" tracking ──────────────────────────────────────────────
// The extension keeps a compact copy of the user's JobTrackr jobs in
// storage.local under `appliedJobs`, so the on-page score pill can tell the user
// they've already applied to / saved the current posting. The list is populated
// from the app tab's localStorage (via read-jobs.js — authoritative) and topped
// up locally whenever the extension adds a job.

// Several job boards serve every posting under a single shared path and encode the
// posting's identity in the query string instead: LinkedIn (/jobs/view/<id> or
// ?currentJobId=<id>), Indeed (/viewjob?jk=… or a search page with ?vjk=…),
// Glassdoor (?jobListingId=…). For these the query id is the ONLY stable identity —
// stripping the query (as normalizeJobUrl does) collapses the whole board to one
// key, so every posting would look like the same job. Return a namespaced id
// ('indeed:abc123') when one can be extracted, else ''.
function jobBoardId(u) {
  if (!u) return ''
  try {
    const url = new URL(u)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const q = url.searchParams
    if (/(^|\.)linkedin\.com$/.test(host)) {
      const m = url.pathname.match(/\/jobs\/view\/(\d+)/)
      const id = (m && m[1]) || q.get('currentJobId')
      return id && /^\d+$/.test(id) ? 'linkedin:' + id : ''
    }
    if (/(^|\.)indeed\.[a-z.]+$/.test(host)) {
      const id = q.get('jk') || q.get('vjk')
      return id ? 'indeed:' + id.toLowerCase() : ''
    }
    if (/(^|\.)glassdoor\.[a-z.]+$/.test(host)) {
      const id = q.get('jobListingId') || q.get('jl')
      return id ? 'glassdoor:' + id.toLowerCase() : ''
    }
    return ''
  } catch {
    return ''
  }
}

// True for the boards above: their bare host+path is a shared listing path, not a
// per-job identity, so it must never be used as a fallback URL match key.
function isQueryKeyedBoard(u) {
  try {
    const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase()
    return /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+)$/.test(host)
  } catch {
    return false
  }
}

// Normalize a company/position string for comparison: lowercase, unify dash
// variants, collapse ALL whitespace (incl. non-breaking spaces — JS \s matches
// them) to single spaces, and trim. Guards the exact-equality match against
// invisible differences, e.g. LinkedIn's "Project / Delivery Manager" vs a
// stored copy with a non-breaking space around the slash.
function normStr(s) {
  return (s || '').toString().toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim()
}

// Stable identity for a job: LinkedIn job id when applicable, else normalized URL
// (host + path, no query/hash), else company|position — matching how the web app
// dedups.
function normalizeJobUrl(u) {
  try {
    const url = new URL(u)
    const path = url.pathname.replace(/\/+$/, '')
    return (url.hostname.replace(/^www\./, '') + path).toLowerCase()
  } catch {
    return (u || '').trim().toLowerCase()
  }
}
function jobKey(j) {
  const bid = jobBoardId(j && j.url)
  if (bid) return 'b:' + bid
  // A query-keyed board URL with no extractable id has only a shared listing path,
  // which is NOT a per-job identity — fall through to company|position rather than
  // collapsing every posting on that board into one key.
  if (j && j.url && !isQueryKeyedBoard(j.url)) {
    const u = normalizeJobUrl(j.url)
    if (u) return 'u:' + u
  }
  return 'cp:' + normStr(j && j.company) + '|' + normStr(j && j.position)
}
function compactJob(j) {
  return {
    url: j.url || '',
    company: j.company || '',
    position: j.position || '',
    status: j.status || '',
    date: j.date || j.date_applied || j.appliedAt || '',
    _local: !!j._local,
    ...(j._localAt ? { _localAt: j._localAt } : {})
  }
}

// A locally-added ("optimistic") job should appear in the app's authoritative list
// within one sync. If it still hasn't after this grace window, the web-app import
// never stuck (tab closed, deduped, error…) — so stop flagging it as tracked
// instead of preserving it forever and reporting a job the app doesn't have.
// Kept short on purpose: once the app has been read and does NOT contain a
// locally-added job, treat it as gone (the user deleted it, or the import never
// stuck) rather than showing a stale "déjà suivi". This only needs to bridge the
// brief gap between the extension adding a job and the app tab persisting it.
const LOCAL_ENTRY_TTL = 45 * 1000  // 45 s

// Replace the cache with the app's authoritative list, but keep any local-only
// entries (extension-added, not yet in the fetched list) that would otherwise
// vanish on a refresh — for as long as they're still within their grace window.
async function setAppliedJobsFromApp(appJobs) {
  const existing = (await browser.storage.local.get('appliedJobs')).appliedJobs || []
  const map = new Map()
  for (const j of appJobs) map.set(jobKey(j), compactJob({ ...j, _local: false }))
  const now = Date.now()
  for (const j of existing) {
    const k = jobKey(j)
    if (j._local && !map.has(k) && (now - (j._localAt || 0) < LOCAL_ENTRY_TTL)) map.set(k, j)
  }
  const merged = [...map.values()]
  await browser.storage.local.set({ appliedJobs: merged, appliedJobsSyncedAt: now })
  return merged
}

// Upsert a single job the extension just added.
async function recordAppliedJob(job) {
  if (!job || (!job.url && !(job.company && job.position))) return
  const existing = (await browser.storage.local.get('appliedJobs')).appliedJobs || []
  const map = new Map(existing.map(j => [jobKey(j), j]))
  map.set(jobKey(job), compactJob({
    url: job.url || '',
    company: job.company || '',
    position: job.position || '',
    status: job.status || 'todo',
    date: job.date || new Date().toISOString(),
    _local: true,
    _localAt: Date.now()
  }))
  await browser.storage.local.set({ appliedJobs: [...map.values()] })
}

// Read the user's jobs from an already-open JobTrackr tab (no temp tab). Returns
// null when no app tab is open or the read fails.
async function readJobsFromOpenAppTab() {
  const { appUrl } = await browser.storage.local.get('appUrl')
  const base = appUrl || DEFAULT_APP_URL
  const tabs = await browser.tabs.query({})
  const appTab = tabs.find(t => t.url && t.url.startsWith(base))
  if (!appTab) return null
  try {
    const res = await injectFile(appTab.id, 'read-jobs.js')
    return res && res.ok && Array.isArray(res.jobs) ? res.jobs : null
  } catch {
    return null
  }
}

// Answer the pill: is this posting already in the user's JobTrackr? Refreshes the
// cache from an open app tab when it's empty or stale (throttled to 20s) so the
// answer reflects the real list, then matches by URL first, company+position next.
// Load the applied-jobs cache, refreshing it from an open app tab when it's empty
// or stale (throttled to 20s) so matches reflect the user's real list.
async function getAppliedList() {
  const store = await browser.storage.local.get(['appliedJobs', 'appliedJobsSyncedAt'])
  let applied = store.appliedJobs || []
  const stale = !store.appliedJobsSyncedAt || (Date.now() - store.appliedJobsSyncedAt) > 20000
  if (applied.length === 0 || stale) {
    const fresh = await readJobsFromOpenAppTab()
    if (fresh) applied = await setAppliedJobsFromApp(fresh)
  }
  return applied
}

// Find the cached job matching a posting: board id first, then normalized URL
// (skipped on query-keyed boards where the path is shared), then exact
// company+position, then a looser company + contained-position match (handles a
// "… H/F"/"(Remote)"/location suffix one side appends). Returns the job or null.
function matchApplied(applied, { url, company, position }) {
  const bid = jobBoardId(url)
  const nUrl = isQueryKeyedBoard(url) ? '' : normalizeJobUrl(url)
  const c = normStr(company)
  const p = normStr(position)
  let match = null
  if (bid) match = applied.find(j => jobBoardId(j.url) === bid)
  if (!match && nUrl) match = applied.find(j => j.url && !isQueryKeyedBoard(j.url) && normalizeJobUrl(j.url) === nUrl)
  if (!match && c && p) match = applied.find(j => normStr(j.company) === c && normStr(j.position) === p)
  if (!match && c && p) match = applied.find(j => {
    const jc = normStr(j.company), jp = normStr(j.position)
    return jc === c && jp && (jp.includes(p) || p.includes(jp))
  })
  return match || null
}

// Answer the pill: is this posting already in the user's JobTrackr?
async function checkApplied({ url, company, position }) {
  const applied = await getAppliedList()
  const match = matchApplied(applied, { url, company, position })
  if (!match) return { applied: false }
  return { applied: true, status: match.status || '', date: match.date || '', company: match.company || '', position: match.position || '' }
}


