// Shared CV-generation logic — the single source of truth used by BOTH the
// one-job generator (CVGenerator.jsx) and the batch generator
// (BatchCVGenerator.jsx). Keeping the JD resolution, language detection, the
// generation-settings readers and the /api/generate-cv call here means the two
// entry points always produce a CV the exact same way.
import { aiFetch } from './apiKey'
import { detectLanguage } from '../utils/detectLanguage'

const IS_DEV = import.meta.env.DEV

// localStorage keys — the same ones written by CVGenerationSettings, so the
// batch reads back whatever the user picked in Settings → My CV.
const BASE_CV_KEY  = 'jobtrackr_cv_base_id'
const TEMPLATE_KEY = 'jobtrackr_cv_template'

// Resolve the "Auto" language choice to an explicit fr/en/jp BEFORE calling the
// API — letting the English-biased server prompt "detect" is unreliable. We use
// the strongest signal: the job description first (the CV should match the target
// posting's language), then the source CV. Japanese is detected by kana/kanji;
// everything else defers to the shared en/fr heuristic.
// Hiragana + Katakana (U+3040–30FF) and CJK ideographs (U+3400–4DBF, U+4E00–9FFF).
const HAS_JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/
export function resolveAutoLanguage(jd, cvText, job) {
  const primary = (jd || '').trim() || (cvText || '').trim()
  if (HAS_JAPANESE.test(primary)) return 'jp'
  return detectLanguage({
    notes: primary,
    position: job?.position || '',
    company: job?.company || '',
  })
}

// Contact details come from the user's profile (Settings → Profile), not the CV
// text — the model corrupts verbatim tokens like emails/LinkedIn when it rewrites
// the CV, so we pass these as authoritative values and the API pins the contact
// line to them.
export function loadProfileContact() {
  try {
    const p = JSON.parse(localStorage.getItem('jobtrackr_profile') || 'null')
    if (!p) return null
    const contact = {
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      linkedin: p.linkedin || '',
      website: p.website || p.portfolio || '',
    }
    // Only send if at least one contact field is filled, otherwise let the CV
    // text remain the source (better than blanking everything out).
    return (contact.email || contact.phone || contact.linkedin || contact.website) ? contact : null
  } catch { return null }
}

// ATS level (Settings → My CV) tunes keyword aggressiveness.
export function loadAtsLevel() {
  const v = localStorage.getItem('jobtrackr_cv_ats_level')
  return ['light', 'balanced', 'max'].includes(v) ? v : 'max'
}

// User-authored CV generation rules (Settings → My CV), free text injected into
// the generation prompt server-side as additional (non-overriding) constraints.
export function loadCustomRules() {
  try { return (localStorage.getItem('jobtrackr_cv_custom_rules') || '').trim() } catch { return '' }
}

// Toggleable generation rules checklist (Settings → My CV). Missing/unknown keys
// default to ON so behavior matches the pre-checklist default.
export function loadRules() {
  const defaults = { keepAllRoles: true, singleLanguage: true, atsFormat: true, keywordMirroring: true, noFabrication: true }
  try {
    const saved = JSON.parse(localStorage.getItem('jobtrackr_cv_rules') || 'null')
    return saved ? { ...defaults, ...saved } : defaults
  } catch { return defaults }
}

// Base CV id chosen in Settings → My CV (empty ⇒ caller falls back to most-recent).
export function loadBaseCvId() {
  try { return localStorage.getItem(BASE_CV_KEY) || '' } catch { return '' }
}
export function saveBaseCvId(id) {
  try { localStorage.setItem(BASE_CV_KEY, id) } catch { /* ignore */ }
}

// Default template for batch generation, persisted separately from the one-job
// generator's in-session pick.
export function loadTemplate() {
  try { return localStorage.getItem(TEMPLATE_KEY) || 'standard' } catch { return 'standard' }
}
export function saveTemplate(id) {
  try { localStorage.setItem(TEMPLATE_KEY, id) } catch { /* ignore */ }
}

// Default language for batch generation ('auto' resolves per posting). Shared by
// the Settings batch panel and the selection-driven batch modal so the choice
// carries across both entry points.
const BATCH_LANG_KEY = 'jobtrackr_cv_batch_lang'
export function loadBatchLang() {
  try { return localStorage.getItem(BATCH_LANG_KEY) || 'auto' } catch { return 'auto' }
}
export function saveBatchLang(v) {
  try { localStorage.setItem(BATCH_LANG_KEY, v) } catch { /* ignore */ }
}

// Missing-skills mode for batch generation: 'none' (add nothing), 'grounded'
// (only the points backed by the CV) or 'all' (every suggested point, incl. the
// "to verify" ones that extend beyond the CV). Mirrors the one-job generator's
// auto-fold; default 'grounded' matches that behaviour.
const SKILLS_MODE_KEY = 'jobtrackr_cv_batch_skills'
const SKILLS_MODES = ['none', 'grounded', 'all']
export function loadSkillsMode() {
  try { const v = localStorage.getItem(SKILLS_MODE_KEY); return SKILLS_MODES.includes(v) ? v : 'grounded' } catch { return 'grounded' }
}
export function saveSkillsMode(v) {
  try { localStorage.setItem(SKILLS_MODE_KEY, v) } catch { /* ignore */ }
}

// The candidate name is the CV's "# Name" heading — used to build the filename.
export function cvCandidateName(markdown) {
  const m = (markdown || '').match(/^#\s+(.+)$/m)
  return (m?.[1] || '').trim()
}

// Resolve the best available job description for a candidature: the stored JD
// first, then scrape the posting URL, falling back to the free-text notes. Never
// throws — returns '' when nothing usable is found so the caller can skip.
export async function fetchJobDescription(job) {
  if (job?.jobDescription) return job.jobDescription
  if (!job?.url) return job?.notes || ''
  if (IS_DEV) {
    return `Product Manager chez ${job.company}\n\nNous recherchons un PM expérimenté pour piloter notre roadmap B2B SaaS. Compétences requises : OKR, A/B testing, SQL, Figma, Jira, métriques produit (DAU, NPS, rétention).`
  }
  try {
    const res = await fetch('/api/fetch-jd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: job.url }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.text || job.notes || ''
  } catch {
    return job?.notes || ''
  }
}

// Call /api/generate-cv with the current generation settings and return the
// adapted CV. `additions` are the "Points manquants" the candidate confirmed —
// each { role, company, bullet } is woven into the CV under its role (see the
// suggest flow below). Throws on HTTP error; aiFetch throws TrialExhaustedError on 402.
export async function generateTailoredCV({ cvText, jobDescription, company, position, language, additions = [] }) {
  const res = await aiFetch('/api/generate-cv', {
    cvText,
    jobDescription,
    company,
    position,
    language,
    atsLevel: loadAtsLevel(),
    contact: loadProfileContact(),
    customRules: loadCustomRules(),
    rules: loadRules(),
    additions,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return { cv: data.cv, atsScore: data.atsScore ?? null, verdict: data.verdict ?? null }
}

// "Points manquants" — ask the server for the missing points that would make the
// CV match the posting, each rewritten as a bullet and ASSIGNED to an existing
// role in the CV. Routed through /api/generate-cv (mode:'suggest') to stay under
// Vercel's 12-function cap. Seeded by the Job Match Score gaps (job.scoreDetails
// .gaps) when the caller has them. Returns [] on empty/parse failure — never the
// blocker in the generation flow. Throws TrialExhaustedError on 402.
export async function suggestCvPoints({ cvText, jobDescription, company, position, language, knownGaps = [] }) {
  if (!cvText || !jobDescription) return []
  const res = await aiFetch('/api/generate-cv', {
    mode: 'suggest',
    cvText,
    jobDescription,
    company,
    position,
    language,
    knownGaps,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data.suggestions) ? data.suggestions : []
}

// High-level orchestration for the batch generator: resolve JD → resolve
// language → generate → package a ready-to-save result. Throws an error with
// `code === 'NO_JD'` when the candidature has no description to generate from, so
// the batch can mark it "skipped" rather than "failed".
export async function generateCVForJob({ job, cvText, language = 'auto', template = 'standard', skillsMode = 'none' }) {
  const jd = (await fetchJobDescription(job) || '').trim()
  if (!jd) {
    const err = new Error('No job description available for this application')
    err.code = 'NO_JD'
    throw err
  }

  const lang = language === 'auto' ? resolveAutoLanguage(jd, cvText, job) : language

  if (IS_DEV) {
    const name = loadProfileContact()?.name || 'Candidat'
    const mock = `# ${name}\nParis, France · exemple@email.com\n\n## Profil\nCV adapté (mock dev) pour ${job.company} — ${job.position}.\n\n## Expérience\n### Poste\n- Exemple de réalisation adaptée à l'offre`
    return { markdown: mock, atsScore: 92, template, filename: `${name} - ${job.position}` }
  }

  // Optionally fold in the missing skills. 'grounded' keeps only the points
  // backed by the CV; 'all' also adds the "to verify" ones. Best-effort: a
  // suggest failure must never block generation — but a spent free trial still
  // stops the batch, so let that one bubble up.
  let additions = []
  if (skillsMode && skillsMode !== 'none') {
    try {
      const list = await suggestCvPoints({
        cvText,
        jobDescription: jd,
        company: job.company,
        position: job.position,
        language: lang,
        knownGaps: job?.scoreDetails?.gaps || [],
      })
      const picked = skillsMode === 'all' ? list : list.filter(s => s.confidence === 'grounded')
      additions = picked.map(s => ({ role: s.role, company: s.company, bullet: s.bullet }))
    } catch (err) {
      if (err?.code === 'TRIAL_EXHAUSTED') throw err
    }
  }

  const { cv, atsScore } = await generateTailoredCV({
    cvText,
    jobDescription: jd,
    company: job.company,
    position: job.position,
    language: lang,
    additions,
  })
  const name = cvCandidateName(cv) || loadProfileContact()?.name || 'CV'
  return { markdown: cv, atsScore, template, filename: `${name} - ${job.position}` }
}
