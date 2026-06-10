// JobTrackr Background Script
// v1.3.2 — Fix icon disappearing + async listener

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

// Re-set icon on startup — Firefox MV2 persistent background can lose it
browser.browserAction.setIcon({ path: { 48: 'icons/icon48.png' } })
browser.browserAction.setTitle({ title: 'JobTrackr' })

const DEFAULT_PROFILE = {
  name: 'Alexandre Leblanc',
  title: 'Senior Product Manager / Product Owner',
  experience: '18 ans d\'expérience internationale en product management : gaming (Wargaming), AdTech (Hakuhodo I-Studio, SmartNews), mobile (Rakuten), Web3/DeFi (Datachain). 10 ans basé au Japon, retour en France.',
  skills: [
    'Product strategy & roadmap',
    'Agile / Scrum (certifié Scrum Master & Product Owner)',
    'Data-driven decision making',
    'Stakeholder management cross-fonctionnel',
    'Intégration de l\'IA dans les produits (Claude API, ComfyUI, workflows LLM)',
    'B2C & B2B, mobile, SaaS, fintech, web3',
    'Management d\'équipes internationales (FR/EN/JP)'
  ],
  languages: 'Trilingue : Français (natif), Anglais (courant), Japonais (JLPT N1)',
  education: 'Ingénieur Arts & Métiers ParisTech',
  ai_experience: 'Utilisateur avancé de l\'IA : ComfyUI/Wan pour la génération vidéo, Claude API pour construire JobTrackr (app React+Vercel+Claude en production). Prompt engineering avancé, intégration d\'agents IA dans les workflows produit.',
  recent_project: 'JobTrackr — app de suivi de candidatures full-stack (React, Tailwind, Vercel serverless, Claude Haiku, extension Firefox). Déployée en production.',
  motivation_default: 'Passionné par les produits qui résolvent des vrais problèmes utilisateurs avec une exécution rigoureuse. Fort intérêt pour l\'IA appliquée au produit et l\'international.'
}

// ─── Listener messages ────────────────────────────────────────────────────────
// IMPORTANT Firefox MV2 : NE PAS retourner une Promise depuis onMessage.
// Ça cause "Promised response from onMessage listener went out of scope"
// quand le background event page s'endort entre deux microtasks.
// Fix : callback sendResponse + "return true" pour signaler une réponse async.
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'AUTOFILL_REQUEST') {
    handleAutofill(msg)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }))
    return true  // <-- keepAlive Firefox
  }

  if (msg.type === 'GET_APP_URL') {
    browser.storage.local.get('appUrl').then(data => {
      sendResponse({ appUrl: data.appUrl || 'https://jobtracking-three.vercel.app' })
    })
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

  if (msg.type === 'GET_API_KEY') {
    browser.storage.local.get('apiKey').then(data => {
      sendResponse({ apiKey: data.apiKey || '' })
    })
    return true
  }

  if (msg.type === 'SAVE_API_KEY') {
    browser.storage.local.set({ apiKey: msg.apiKey }).then(() => {
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
    console.log('[JT BG] SAVE_JD called with key:', msg.key, 'text length:', msg.text?.length)
    browser.storage.local.set({ [msg.key]: msg.text }).then(() => {
      console.log('[JT BG] SAVE_JD completed for key:', msg.key)
      sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'LOAD_JD') {
    console.log('[JT BG] LOAD_JD called with key:', msg.key)
    browser.storage.local.get(msg.key).then(data => {
      const text = data[msg.key] || ''
      console.log('[JT BG] LOAD_JD returning text length:', text.length, 'for key:', msg.key)
      sendResponse({ text })
    })
    return true
  }
})

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
    const results = await browser.tabs.executeScript(appTab.id, {
      file: 'sync.js'
    })
    result = results?.[0] || { synced: false }
  } finally {
    if (tempTab) await browser.tabs.remove(appTab.id)
  }

  if (result.synced) {
    const toSave = {}
    if (result.profile) toSave.profile = result.profile
    if (result.cvText)  { toSave.cvText = result.cvText; toSave.cvName = result.cvName }
    if (Object.keys(toSave).length > 0) {
      await browser.storage.local.set(toSave)
    }
    return { success: true, hasProfile: !!result.profile, hasCv: !!result.cvText, cvName: result.cvName }
  }

  return { success: false, error: result.error || 'Aucune donnée trouvée dans JobTrackr' }
}

// ─── Autofill handler ────────────────────────────────────────────────────────
async function handleAutofill(msg) {
  const { fields, jobContext } = msg

  const [storedProfile, storedKey, storedCvText] = await Promise.all([
    browser.storage.local.get('profile').then(d => d.profile || DEFAULT_PROFILE),
    browser.storage.local.get('apiKey').then(d => d.apiKey || ''),
    browser.storage.local.get('cvText').then(d => d.cvText || null)
  ])

  if (!storedKey) {
    return { error: 'Clé API Claude manquante. Va dans le popup > ⚙️ et entre ta clé Anthropic.' }
  }

  try {
    const answers = await callClaude(fields, jobContext, storedProfile, storedKey, storedCvText)
    return { success: true, answers }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── Appel Claude API ─────────────────────────────────────────────────────────
async function callClaude(fields, jobContext, profile, apiKey, cvText = null) {
  const fieldsText = fields.map((f, i) =>
    `Champ ${i + 1}: "${f.label}"${f.maxLength ? ` (max ${f.maxLength} chars)` : ''}`
  ).join('\n')

  // Build profile section — prefer full CV text if available, fallback to profile fields
  let profileText
  if (cvText) {
    profileText = [
      `Nom: ${profile.name || ''}`,
      `Titre: ${profile.title || ''}`,
      `Langues: ${profile.languages || ''}`,
      '',
      '## CV complet (source principale — utilise ces informations en priorité)',
      cvText.slice(0, 4000)
    ].join('\n')
  } else {
    profileText = [
      `Nom: ${profile.name}`,
      `Titre: ${profile.title}`,
      `Expérience: ${profile.experience}`,
      `Compétences: ${(profile.skills || []).join(', ')}`,
      `Langues: ${profile.languages}`,
      `Formation: ${profile.education}`,
      `Expérience IA: ${profile.ai_experience}`,
      `Projet récent: ${profile.recent_project}`,
      `Motivation: ${profile.motivation_default}`
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
- Match the language of each label (EN if EN label, FR if FR label)
- For "Full Name" / "Email" / "LinkedIn": copy exactly from the profile
- For "what makes X special": show real product/company knowledge, be specific
- For "why join": connect the role to the candidate's concrete experience
- For "AI experience": use the candidate's AI profile (JobTrackr, Claude API, ComfyUI)

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
- Adapte la langue au label (FR si FR, EN si EN)
- Pour "Full Name" / "Email" / "LinkedIn" : copie exactement la valeur du profil
- Pour "what makes X special" : montre une vraie connaissance produit/entreprise, sois précis
- Pour "why join" : relie l'offre à l'expérience concrète du candidat
- Pour "AI experience" : utilise le profil IA du candidat (JobTrackr, Claude API, ComfyUI)

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

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Claude API ${res.status}: ${err.error?.message || res.statusText}`)
  }

  const data = await res.json()
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


