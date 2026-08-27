// JobTrackr Content Script
// v1.3 — + Autofill formulaires de candidature via Claude AI

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 : CODE EXISTANT (inchangé)
// ─────────────────────────────────────────────────────────────────────────────

function getText(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel)
      if (el?.textContent?.trim()) return el.textContent.trim()
    } catch {}
  }
  return ''
}

function meta(name) {
  return document.querySelector(`meta[property="${name}"]`)?.getAttribute('content')
    || document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')
    || ''
}

// ────────────────────────────────────────────────────────────────────────────────
// Smart text extraction: removes nav clutter, finds content start, intelligently filters
// ────────────────────────────────────────────────────────────────────────────────

const NAV_PATTERNS = [
  /^\d+\s*(notification|message|alert)/i,
  /^skip\s+(to|the)/i,
  /^(next|previous|back|forward)\s+(page|article)/i,
  /^(home|about|contact|login|sign\s+up|subscribe)/i,
  /^(follow|share|tweet|like|save|report|view\s+all)/i,
  /^(cookie|privacy|terms|cookie\s+settings)/i,
  /^(load\s+more|view\s+more|see\s+all|show\s+more)/i,
  /^(apply|easy\s+apply|quick\s+apply|one\-click)/i,
  /^(promoted|sponsored|advertisement|ad\s+|advert)/i,
  /^\d+\s*(applicant|view|like|comment|share)/i,
  /^(open\s+in\s+new|external\s+link|visit\s+site)/i,
  /^(menu|navigation|search|filter|sort)/i,
  /^(ago|min|minute|hour|day|week|month|year)\s+(ago)?$/i,
  /^(\+|-|×|÷|=|>|<|\||&|©|®|™)/,
]

const CONTENT_START_MARKERS = [
  'company name',
  'job title',
  'position',
  'title',
  'about this job',
  'job details',
  'job description',
  'description',
  'requirements',
  'qualifications',
  'about the role',
  'what you\'ll do',
  'responsibilities',
  'mission',
  'the role',
  'entreprise',
  'société',
  'poste',
  'titre',
  'à propos de ce',
  'détails de l\'emploi',
  'description du poste',
  'responsabilités',
  'compétences requises',
  'qualifications requises',
]

function isNavLine(line) {
  const trimmed = line.trim()
  if (trimmed.length === 0) return true
  if (trimmed.length < 2) return true
  return NAV_PATTERNS.some(pattern => pattern.test(trimmed))
}

function findContentStart(text) {
  const lines = text.split('\n')
  let contentStartIdx = 0
  let highestScore = -1

  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i].toLowerCase()
    let score = 0

    CONTENT_START_MARKERS.forEach(marker => {
      if (line.includes(marker)) score += 10
    })

    if (line.includes('job') || line.includes('position') || line.includes('emploi')) score += 3
    if (line.length > 20) score += 2
    if (!/^\d+\s*(notification|applicant|view)/.test(line)) score += 1

    if (score > highestScore) {
      highestScore = score
      contentStartIdx = i
    }
  }

  return Math.max(0, contentStartIdx - 1)
}

function cleanAndFilterText(rawText) {
  let lines = rawText.split('\n')
    .map(l => l.trim())
    .filter(l => !isNavLine(l))
    .filter(l => l.length > 0)

  // Remove consecutive duplicates
  lines = lines.reduce((acc, line) => {
    if (acc.length === 0 || acc[acc.length - 1] !== line) {
      acc.push(line)
    }
    return acc
  }, [])

  // Find where real content starts
  const contentStart = findContentStart(lines.join('\n'))
  lines = lines.slice(contentStart)

  return lines.join('\n')
}

function getFullPageText() {
  const clone = document.body.cloneNode(true)
  clone.querySelectorAll('script, style, nav, footer, header, aside, [role="banner"], [role="navigation"], [aria-hidden="true"], ' + NOISE_CONTAINER_SEL).forEach(el => el.remove())
  const rawText = clone.innerText || clone.textContent || ''
  const normalized = rawText.replace(/\s{3,}/g, '\n').trim()
  const cleaned = cleanAndFilterText(normalized)
  return cleaned.slice(0, 15000)
}

// Consent / cookie banners often carry a "description" class (e.g. HelloWork's
// "hw-cc-opt-in-box__description"), so generic scraping can mistake the cookie
// notice for the job description. Skip anything living inside such a container.
const NOISE_CONTAINER_SEL = '[class*="cookie"],[id*="cookie"],[class*="consent"],[id*="consent"],[class*="hw-cc"],[class*="gdpr"],[id*="gdpr"]'
function isNoiseEl(el) {
  try { return !!el.closest(NOISE_CONTAINER_SEL) } catch { return false }
}

function getSectionTexts(selectors) {
  return selectors.flatMap(sel => {
    try { return [...document.querySelectorAll(sel)].filter(el => !isNoiseEl(el)).map(el => el.textContent?.trim()).filter(Boolean) }
    catch { return [] }
  }).join('\n\n')
}

// Boilerplate LinkedIn/ATS glue around the actual JD. Stripped so it doesn't
// pollute the description shown to the user or the Claude scoring prompt.
// textContent has no newlines between a heading and its body, so the label can
// be glued to the text ("About the jobWe are…") — handle both prefix & line.
const JD_NOISE_PREFIXES = [
  /^\s*about the (job|role|position|team|company)\s*/i,
  /^\s*about this (job|role|position)\s*/i,
  /^\s*(the )?(full )?job description\s*[:\-]?\s*/i,
  /^\s*role description\s*[:\-]?\s*/i,
  /^\s*à propos (du poste|de l'offre|de ce poste|de l'emploi|de l'entreprise)\s*/i,
  /^\s*description (du poste|de l'offre|de l'emploi)\s*[:\-]?\s*/i,
]
const JD_NOISE_LINES = [
  /^about the (job|role|position|team|company)$/i,
  /^about this (job|role|position)$/i,
  /^(the )?(full )?job description$/i,
  /^role description$/i,
  /^à propos (du poste|de l'offre|de ce poste|de l'emploi|de l'entreprise)$/i,
  /^description (du poste|de l'offre|de l'emploi)$/i,
  /^show (more|less)$/i,
  /^see (more|less)$/i,
  /^voir (plus|moins)$/i,
  /^afficher (plus|moins)$/i,
  /^lire (plus|la suite)$/i,
]
// LinkedIn appends a structured criteria block after the JD body — cut it off.
const JD_CUTOFF_MARKERS = [
  /^seniority level\b/i,
  /^employment type\b/i,
  /^job function\b/i,
  /^industries$/i,
  /^niveau hiérarchique\b/i,
  /^type d'emploi\b/i,
  /^fonction\b/i,
  /^secteurs$/i,
]

function cleanJobDescription(text) {
  if (!text) return text
  // Strip glued/leading boilerplate label.
  for (const re of JD_NOISE_PREFIXES) text = text.replace(re, '')
  let lines = text.split('\n').map(l => l.trim())
  // Drop a leading run of blank/boilerplate lines.
  while (lines.length && (lines[0] === '' || JD_NOISE_LINES.some(re => re.test(lines[0])))) lines.shift()
  // Truncate at the first structured-criteria footer marker.
  const cut = lines.findIndex(l => JD_CUTOFF_MARKERS.some(re => re.test(l)))
  if (cut > 0) lines = lines.slice(0, cut)
  // Drop inline UI-noise lines anywhere, then collapse blank runs.
  lines = lines.filter(l => !JD_NOISE_LINES.some(re => re.test(l)))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Convert a JobPosting JSON-LD `description` (which is HTML) to readable plain
// text. DOMParser never executes scripts, so this is safe on untrusted markup.
// Block elements become line breaks and <li> become bullets so the structure
// survives the flattening.
function htmlToText(html) {
  if (!html || typeof html !== 'string') return ''
  // Already plain text (no tags) — return as-is.
  if (!/<[a-z][\s\S]*>/i.test(html)) return html.trim()
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
    doc.querySelectorAll('li').forEach(li => { li.prepend('• '); li.append('\n') })
    doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,section,tr,ul,ol').forEach(el => el.append('\n'))
    const text = doc.body.textContent || ''
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

function getJobDescription() {
  return cleanJobDescription(getJobDescriptionRaw())
}

function getJobDescriptionRaw() {
  const hostname = window.location.hostname

  if (hostname.includes('linkedin.com')) {
    return getSectionTexts([
      '.show-more-less-html__markup',
      '.show-more-less-html__content',
      '[data-tooltip-id="jobs-details"]',
      '.jobs-description__content',
      '.jobs-box__html-content',
      '[class*="description__text"]',
      '.jobs-details__main-content',
      '[class*="job-details"]'
    ])
  }

  if (hostname.includes('indeed.com')) {
    return getSectionTexts(['#jobDescriptionText', '[class*="jobsearch-JobComponent-description"]'])
  }

  if (hostname.includes('welcometothejungle.com')) {
    // WTTJ splits sections: description, preferred experience, requirements, etc.
    return getSectionTexts([
      '[data-testid="job-section-description"]',
      '[data-testid="job-section-requirements"]',
      '[data-testid="job-section-preferred-experience"]',
      '[data-testid^="job-section-"]',
      'article'
    ])
  }

  if (hostname.includes('greenhouse.io') || hostname.includes('ashbyhq.com') || hostname.includes('lever.co')) {
    return getSectionTexts([
      '.job__description', '.posting-page .section-wrapper',
      '[data-qa="job-description"]', '[class*="JobDescription"]',
      '.application-body',
      '[class*="job-post"]', '[class*="posting-content"]',
      '[class*="job-description"]', '[class*="description"]',
      '#content', '#main', 'main'
    ])
  }

  if (hostname.includes('apec.fr')) {
    return getSectionTexts(['.details-post', '.job-description', '[class*="description"]'])
  }

  // Generic: try to grab every named section (description + requirements + experience)
  const sections = getSectionTexts([
    '[class*="description"]', '[class*="requirement"]',
    '[class*="qualification"]', '[class*="experience"]',
    '[class*="job-detail"]', '[class*="job_detail"]',
    'article', 'main [class*="content"]'
  ])
  return sections
}

// ATS / job-board hosts where the company slug is the first path segment and
// the job title lives in an <h1> (client-rendered, no parseable <title>).
const ATS_HOSTS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'recruitee.com',
  'teamtailor.com', 'smartrecruiters.com', 'bamboohr.com', 'jobvite.com',
  'icims.com', 'personio.com', 'workday', 'breezy.hr', 'pinpointhq.com'
]

// Best-effort job title from the page DOM — covers ATS boards whose <title>
// is just the company name or empty.
function getDomJobTitle() {
  // Prefer JobPosting JSON-LD title handled by caller; here scan known headings.
  const candidates = getText([
    'h1.app-title',
    '.job__title h1', '.job-title h1', '.posting-headline h2',
    '[data-qa="job-title"]', '[data-testid="job-title"]',
    '[class*="posting-headline"]', '[class*="job-title"]',
    '[class*="job__title"]', '[class*="position-title"]',
    'main h1', 'article h1', 'h1'
  ])
  // Reject obvious non-titles (nav, cookie banners, the whole page).
  if (!candidates || candidates.length > 120) return ''
  if (/^(apply|postuler|back to jobs|menu|search)/i.test(candidates)) return ''
  return candidates
}

// ATS boards encode the company as the first URL path segment, e.g.
// job-boards.eu.greenhouse.io/amplemarket/jobs/123 → "Amplemarket".
function companyFromUrlPath(pathname) {
  const seg = (pathname || '').split('/').filter(Boolean)[0] || ''
  // Skip generic segments that aren't a company slug.
  if (!seg || /^(jobs?|careers?|postings?|embed|o|j|en|fr|us)$/i.test(seg)) return ''
  if (seg.length > 40 || /^\d+$/.test(seg)) return ''
  return seg
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function extractJobInfo() {
  const url = window.location.href
  const hostname = window.location.hostname.replace('www.', '')
  const title = document.title || ''
  const isAts = ATS_HOSTS.some(h => hostname.includes(h))

  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
    .filter(Boolean)
    .flatMap(d => Array.isArray(d) ? d : (Array.isArray(d['@graph']) ? d['@graph'] : [d]))
    .find(d => d && (d['@type'] === 'JobPosting' || d.hiringOrganization || d.title))

  let company = '', position = ''

  if (jsonLd) {
    const org = jsonLd.hiringOrganization
    company = (typeof org === 'object' ? org?.name : org) || ''
    position = jsonLd.title || jsonLd.name || ''
  } else if (isAts) {
    // Greenhouse / Lever / Ashby & co: company from URL slug, title from DOM.
    company = companyFromUrlPath(window.location.pathname)
    position = getDomJobTitle()
  } else if (hostname.includes('linkedin.com')) {
    const cleaned = title.replace(' | LinkedIn', '').trim()
    const pipeIdx = cleaned.lastIndexOf(' | ')
    const dashIdx = cleaned.lastIndexOf(' - ')
    if (pipeIdx > dashIdx && pipeIdx > 0) {
      position = cleaned.substring(0, pipeIdx).trim()
      company = cleaned.substring(pipeIdx + 3).trim()
    } else if (dashIdx > 0) {
      position = cleaned.substring(0, dashIdx).trim()
      company = cleaned.substring(dashIdx + 3).trim()
    } else {
      position = cleaned
      company = ''
    }
  } else if (hostname.includes('indeed.com')) {
    const cleaned = title.replace(/\s*[\|\-]\s*Indeed.*$/i, '')
    const parts = cleaned.split(' - ')
    position = parts[0]?.trim() || ''
    company = parts[1]?.trim() || ''
  } else if (hostname.includes('welcometothejungle.com')) {
    const parts = title.split(' - ')
    position = parts[0]?.trim() || ''
    company = parts[1]?.trim() || ''
  } else {
    const pipeIdx = title.lastIndexOf(' | ')
    const dashIdx = title.lastIndexOf(' - ')
    if (pipeIdx > dashIdx && pipeIdx > 0) {
      position = title.substring(0, pipeIdx).trim()
      company = title.substring(pipeIdx + 3).trim().split(/\s*[-|]\s*/)[0]
    } else if (dashIdx > 0) {
      position = title.substring(0, dashIdx).trim()
      company = title.substring(dashIdx + 3).trim().split(/\s*[-|]\s*/)[0]
    } else {
      position = title
      company = meta('og:site_name') || hostname.split('.')[0]
    }
  }

  // ── Fallbacks: fill anything still missing from the DOM / URL ───────────────
  if (!position || position.length > 120) {
    const domTitle = getDomJobTitle()
    if (domTitle) position = domTitle
  }
  if (!company) {
    company = companyFromUrlPath(window.location.pathname)
      || meta('og:site_name')
      || (jsonLd?.hiringOrganization && (typeof jsonLd.hiringOrganization === 'object' ? jsonLd.hiringOrganization.name : jsonLd.hiringOrganization))
      || ''
  }
  // Strip site-name noise sometimes glued onto the company (e.g. "Acme | Careers").
  company = (company || '').replace(/\s*[|–—-]\s*(careers?|jobs?|hiring|recruiting).*$/i, '').trim()

  const targeted = getJobDescription()
  // JobPosting JSON-LD carries the site's own canonical description. It's the
  // most reliable source and immune to DOM-scraping traps like cookie-consent
  // banners (e.g. HelloWork's generic [class*="description"] otherwise matches
  // "hw-cc-opt-in-box__description" and returns the cookie notice as the JD).
  const ldDescription = jsonLd ? cleanJobDescription(htmlToText(jsonLd.description)) : ''

  // Hosts with a tuned handler in getJobDescriptionRaw() — there, the targeted
  // DOM extraction is scoped precisely (and sometimes more complete than the
  // JSON-LD, e.g. WTTJ splits description/requirements/experience), so it wins.
  // Everywhere else the greedy generic selectors can pick up page chrome, so the
  // structured JSON-LD description is preferred over them.
  const DEDICATED_JD_HOSTS = [
    'linkedin.com', 'indeed.com', 'welcometothejungle.com',
    'greenhouse.io', 'ashbyhq.com', 'lever.co', 'apec.fr'
  ]
  const hasDedicatedJd = DEDICATED_JD_HOSTS.some(h => hostname.includes(h))

  let description = ''
  if (hasDedicatedJd && targeted && targeted.length > 100) {
    description = targeted
  } else if (ldDescription && ldDescription.length > 100) {
    description = ldDescription
  } else if (targeted && targeted.length > 100) {
    description = targeted
  } else {
    // Last resort: strip the page down to its likely job content.
    description = getFullPageText()
  }

  return {
    company: company.trim(),
    position: position.trim(),
    description: description.slice(0, 12000),
    url,
    source: hostname.includes('linkedin') ? 'LinkedIn'
      : hostname.includes('indeed') ? 'Indeed'
      : hostname.includes('welcometothejungle') ? 'WTTJ'
      : hostname.includes('apec') ? 'APEC'
      : hostname.includes('hellowork') ? 'HelloWork'
      : hostname.includes('greenhouse') ? 'Greenhouse'
      : hostname.includes('lever.co') ? 'Lever'
      : hostname.includes('ashbyhq') ? 'Ashby'
      : hostname.includes('workday') ? 'Workday'
      : (companyFromUrlPath(window.location.pathname) || hostname.split('.')[0])
  }
}

// ── LinkedIn: resolve a posting's real fields via the guest jobPosting API ────
// LinkedIn's authenticated list/collections pages don't expose the selected job
// in document.title (it shows "(N) Top job picks for you") and their card URLs are
// the shared listing path (?currentJobId=…). The guest endpoint returns clean
// server-rendered HTML (title/company/location/description) for a job id, needs no
// auth, and is same-origin on linkedin.com so the content script can fetch it.
const _linkedInGuestCache = new Map()

function jtLinkedInJobId(u) {
  if (!u) return ''
  // /jobs/view/<id> and also the slug form /jobs/view/<slug>-<id> (guest DOM),
  // plus the two-pane ?currentJobId=<id> param.
  const seg = /\/jobs\/view\/([^/?#]+)/.exec(u)
  if (seg) { const m = /(\d{5,})$/.exec(seg[1]); if (m) return m[1] }
  const cj = /[?&]currentJobId=(\d+)/.exec(u)
  return (cj && cj[1]) || ''
}

async function fetchLinkedInGuest(id) {
  if (!id) return null
  if (_linkedInGuestCache.has(id)) return _linkedInGuestCache.get(id)
  let result = null
  try {
    // Same-origin on whatever LinkedIn subdomain the page is on (fr./www.…);
    // fall back to www when called from elsewhere.
    const base = /(^|\.)linkedin\.com$/.test(location.hostname) ? location.origin : 'https://www.linkedin.com'
    const res = await fetch(`${base}/jobs-guest/jobs/api/jobPosting/${id}`, {
      credentials: 'omit',
      signal: AbortSignal.timeout(4000)
    })
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const pick = (sels) => { for (const s of sels) { const e = doc.querySelector(s); const v = e?.textContent?.replace(/\s+/g, ' ').trim(); if (v) return v } return '' }
      const descEl = doc.querySelector('.show-more-less-html__markup, .description__text--rich, .description__text')
      const description = descEl ? cleanJobDescription(htmlToText(descEl.innerHTML)) : ''
      result = {
        title: pick(['.top-card-layout__title', 'h2.topcard__title', '.topcard__title']),
        company: pick(['.topcard__org-name-link', '.top-card-layout__second-subline a', 'a.topcard__org-name-link']),
        location: pick(['.topcard__flavor--bullet', '.top-card-layout__second-subline .topcard__flavor']),
        description
      }
    }
  } catch (e) {}
  _linkedInGuestCache.set(id, result)
  return result
}

// extractJobInfo() is synchronous and, on LinkedIn's two-pane pages, reads the
// list title from document.title. Enrich it (async) with the selected posting's
// real fields + canonical /jobs/view/<id>/ URL from the guest API.
async function enrichJobInfo() {
  const base = extractJobInfo()
  const host = window.location.hostname.replace('www.', '')
  if (host.includes('linkedin.com')) {
    const id = jtLinkedInJobId(window.location.href)
    if (id) {
      base.url = `https://www.linkedin.com/jobs/view/${id}/`
      const g = await fetchLinkedInGuest(id)
      if (g) {
        if (g.title) base.position = g.title
        if (g.company) base.company = g.company
        if (g.description && g.description.length > (base.description || '').length) base.description = g.description.slice(0, 12000)
      }
    }
  }
  return base
}

// Whether THIS frame should answer detection messages. The content script runs
// in every frame (all_frames: true), so without this guard an ad / reCAPTCHA /
// embed iframe can win the race and return garbage (e.g. company "content").
// The top frame always answers; sub-frames answer only when they actually hold
// a job posting (covers ATS boards embedded via iframe).
function frameHoldsJob() {
  if (window.top === window) return true
  try {
    const hasJsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .some(s => /"@type"\s*:\s*"JobPosting"/i.test(s.textContent || ''))
    if (hasJsonLd) return true
  } catch {}
  // A real job iframe has a meaningful title heading.
  return !!getDomJobTitle()
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 : AUTOFILL — Per-field ✦ buttons + generation
// ─────────────────────────────────────────────────────────────────────────────

async function getIdentityValues() {
  try {
    const data = await browser.storage.local.get('profile')
    const profile = data.profile
    if (!profile) return {}

    const nameParts = (profile.name || '').trim().split(' ')
    const firstname = nameParts[0] || ''
    const lastname = nameParts.slice(1).join(' ')

    return {
      name: profile.name || '',
      firstname,
      lastname,
      email: profile.email || '',
      linkedin: profile.linkedin || '',
      phone: profile.phone || ''
    }
  } catch {
    return {}
  }
}

// ── 2.1 Détection des champs de formulaire ────────────────────────────────────
// Identity fields are filled locally (no AI). Loosened vs. the old exact-anchor
// match so "Email address *" / "Adresse e-mail professionnelle" still resolve.
function identityKeyFor(label) {
  const l = (label || '').toLowerCase()
  if (/^(full.?name|nom.*(complet|prénom)|prénom.*nom|your name|name)$/i.test(l)) return 'name'
  if (/^(prénom|first.?name|given.?name|forename)$/i.test(l)) return 'firstname'
  if (/^(nom(\s+de\s+famille)?|last.?name|surname|family.?name)$/i.test(l)) return 'lastname'
  if (/(e-?mail|courriel|adresse.*(mail|courriel))/i.test(l)) return 'email'
  if (/linkedin/i.test(l)) return 'linkedin'
  if (/(phone|téléphone|\btel\b|mobile|numéro.*téléphone)/i.test(l)) return 'phone'
  return null
}

// Collect fillable controls across the main document, same-origin iframes, and
// (when `deep`) open shadow roots. Cross-origin iframes run their own instance
// of this content script (manifest all_frames), so we skip them here.
function collectCandidates(deep) {
  const SEL = 'textarea, select, input, [contenteditable="true"], [contenteditable=""]'
  const out = []
  const seen = new Set()

  const pushFrom = (root) => {
    let list = []
    try { list = root.querySelectorAll(SEL) } catch { list = [] }
    for (const el of list) { if (!seen.has(el)) { seen.add(el); out.push(el) } }
    if (deep) {
      let hosts = []
      try { hosts = root.querySelectorAll('*') } catch { hosts = [] }
      for (const host of hosts) {
        if (host.shadowRoot) pushFrom(host.shadowRoot)
      }
    }
  }

  pushFrom(document)
  try {
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (doc) pushFrom(doc)
      } catch { /* cross-origin — handled by its own content-script instance */ }
    }
  } catch {}
  return out
}

// Group label for a set of radios: fieldset<legend>, then a role=radiogroup
// aria-label, then the shared name attribute.
function resolveGroupLabel(els) {
  const first = els[0]
  const legend = first.closest?.('fieldset')?.querySelector('legend')
  if (legend?.textContent?.trim()) return legend.textContent.trim()
  const group = first.closest?.('[role="radiogroup"]')
  if (group?.getAttribute('aria-label')?.trim()) return group.getAttribute('aria-label').trim()
  return first.name || null
}

function detectFormFields(opts = {}) {
  const deep = !!opts.deep
  const candidates = collectCandidates(deep)

  const fields = []
  const radioGroups = new Map()

  for (const el of candidates) {
    // Skip the extension's own UI
    if (el.closest?.('[id^="jt-"]')) continue

    const tag = el.tagName.toLowerCase()
    const isTextarea = tag === 'textarea'
    const isSelect = tag === 'select'
    const isCE = el.isContentEditable === true
    const inputType = tag === 'input' ? (el.type || 'text').toLowerCase() : ''

    const isText = isTextarea || isCE ||
      (tag === 'input' && ['text', 'email', 'url', 'tel', 'number', 'search', ''].includes(inputType))
    const isRadio = inputType === 'radio'
    const isCheckbox = inputType === 'checkbox'
    const isFile = inputType === 'file'

    if (!isText && !isSelect && !isRadio && !isCheckbox && !isFile) continue

    // Visibility / editability filtering (textareas kept broadly — modals hide them)
    if (!isTextarea) {
      if (el.disabled || el.readOnly) continue
      if (isText && !isCE && (el.value || '').length > 20) continue
      const view = el.ownerDocument?.defaultView || window
      const style = view.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      // radios/checkboxes are often 0-size behind a styled label — keep them
      if (rect.width === 0 && rect.height === 0 && !isRadio && !isCheckbox) continue
    }

    // Radios: accumulate into groups, emit one field per group below
    if (isRadio) {
      const root = el.form || el.getRootNode?.() || document
      if (!root.__jtRootId) { try { root.__jtRootId = Math.random().toString(36).slice(2) } catch {} }
      const key = (el.name || '(anon)') + '::' + (root.__jtRootId || 'doc')
      let g = radioGroups.get(key)
      if (!g) { g = { els: [] }; radioGroups.set(key, g) }
      g.els.push(el)
      continue
    }

    const label = resolveLabel(el) || el.placeholder || el.name || el.getAttribute?.('aria-label') || el.id || 'Formulaire'
    if ((!label || label === 'Formulaire') && !isTextarea && !isSelect && inputType !== 'text' && inputType !== 'email') continue

    if (isFile) {
      fields.push({ el, label, control: 'file', type: 'file', identityKey: null })
      continue
    }
    if (isCheckbox) {
      fields.push({ el, label, control: 'checkbox', type: 'checkbox', identityKey: null })
      continue
    }
    if (isSelect) {
      const options = [...el.options]
        .map(o => ({ text: (o.textContent || o.label || '').trim(), value: o.value }))
        .filter(o => o.text && o.value !== '')
      fields.push({ el, label, control: 'select', type: 'select', options, identityKey: identityKeyFor(label) })
      continue
    }

    // Free-text or ARIA combobox
    const isCombobox = isComboboxField(el)
    const comboOptions = isCombobox ? (getComboboxOptions(el) || []).map(o => ({ text: o.text })) : null
    fields.push({
      el,
      label,
      control: isCombobox ? 'combobox' : 'text',
      type: tag,
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      placeholder: el.placeholder || '',
      identityKey: identityKeyFor(label),
      isCombobox,
      contentEditable: isCE,
      options: comboOptions
    })
  }

  // Emit one field per radio group
  for (const g of radioGroups.values()) {
    if (!g.els.length) continue
    const first = g.els[0]
    const label = resolveGroupLabel(g.els) || 'Choix'
    const options = g.els
      .map(r => ({ text: (resolveLabel(r) || r.value || '').trim(), value: r.value, el: r }))
      .filter(o => o.text)
    fields.push({ el: first, els: g.els, label, control: 'radio', type: 'radio', options, identityKey: null })
  }

  // Sort: prioritize by relevance to job applications
  fields.sort((a, b) => {
    const lowerA = a.label.toLowerCase()
    const lowerB = b.label.toLowerCase()

    // Deprioritize educational/skills fields (sidebar content)
    const isEduA = /learn|skill|course|education/.test(lowerA)
    const isEduB = /learn|skill|course|education/.test(lowerB)
    if (isEduA !== isEduB) return isEduA ? 1 : -1

    // Prioritize application questions
    const isQuestionA = /question|interest|why|motivat|reason|special|unique/.test(lowerA)
    const isQuestionB = /question|interest|why|motivat|reason|special|unique/.test(lowerB)
    if (isQuestionA !== isQuestionB) return isQuestionA ? -1 : 1

    // Then prioritize empty fields
    const aEmpty = !a.el.value
    const bEmpty = !b.el.value
    if (aEmpty !== bEmpty) return aEmpty ? -1 : 1

    // Finally by position (top first)
    const aPos = a.el.getBoundingClientRect().top
    const bPos = b.el.getBoundingClientRect().top
    return aPos - bPos
  })

  return fields
}

// Résolution du label d'un champ : for=id, aria-label, aria-labelledby,
// parent <label>, ou texte le plus proche dans le DOM
function resolveLabel(el) {
  // 1. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`)
    if (lbl?.textContent?.trim()) return lbl.textContent.trim().replace(/\s+/g, ' ')
  }
  // 2. aria-label direct
  if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim()
  // 3. aria-labelledby
  const lblId = el.getAttribute('aria-labelledby')
  if (lblId) {
    const lbl = document.getElementById(lblId)
    if (lbl?.textContent?.trim()) return lbl.textContent.trim()
  }
  // 4. <label> parent
  const parentLabel = el.closest('label')
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true)
    clone.querySelectorAll('input,textarea,select').forEach(e => e.remove())
    const t = clone.textContent?.trim()
    if (t) return t.replace(/\s+/g, ' ')
  }
  // 5. Texte du nœud précédent ou d'un parent proche (div/p/span avec texte)
  const parent = el.closest('div, p, li, section, fieldset')
  if (parent) {
    // Chercher un élément texte au-dessus dans le même bloc
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_ELEMENT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node === el) break
      const tag = node.tagName.toLowerCase()
      if (['p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'strong', 'label'].includes(tag)) {
        const t = node.textContent?.trim()
        if (t && t.length > 3 && t.length < 200) return t.replace(/\s+/g, ' ')
      }
    }
  }
  // 6. Heading ou paragraphe précédant le champ dans le DOM
  // Priorité : h1-h5 > p/span/div avec texte > ignorer les labels trop courts (ex: "X")
  let node = el
  for (let i = 0; i < 5; i++) {
    let sibling = node.previousElementSibling
    while (sibling) {
      const tag = sibling.tagName?.toLowerCase()
      // Heading direct
      if (['h1','h2','h3','h4','h5'].includes(tag)) {
        const t = sibling.textContent?.trim()
        if (t && t.length > 3 && t.length < 300) return t.replace(/\s+/g, ' ')
      }
      // Heading imbriqué
      const nested = sibling.querySelectorAll ? [...sibling.querySelectorAll('h1,h2,h3,h4,h5')] : []
      const lastHeading = nested[nested.length - 1]
      if (lastHeading) {
        const t = lastHeading.textContent?.trim()
        if (t && t.length > 3 && t.length < 300) return t.replace(/\s+/g, ' ')
      }
      // Paragraphe/span avec texte suffisamment long (labels LinkedIn modal)
      if (['p','span','div','strong'].includes(tag)) {
        const t = sibling.textContent?.trim()
        if (t && t.length > 8 && t.length < 400) return t.replace(/\s+/g, ' ')
      }
      sibling = sibling.previousElementSibling
    }
    if (!node.parentElement) break
    node = node.parentElement
  }
  // 7. placeholder comme fallback (moins fiable)
  if (el.placeholder?.trim() && el.placeholder.length < 100) return el.placeholder.trim()
  return null
}

// ── 2.1b Comboboxes (listes à sélectionner) ───────────────────────────────────
// Un combobox attend une *sélection* dans une liste, pas du texte libre : injecter
// une valeur laisserait le champ réel du formulaire vide. On ne le remplit donc
// que si l'on peut récupérer ses options dans le DOM ; sinon, l'utilisateur choisit.
function isComboboxField(el) {
  if (el.getAttribute('role') === 'combobox') return true
  if (el.hasAttribute('aria-autocomplete')) return true
  if (el.getAttribute('aria-haspopup') === 'listbox') return true
  if (el.hasAttribute('list')) return true // <datalist>
  const owns = el.getAttribute('aria-controls') || el.getAttribute('aria-owns')
  if (owns) {
    const box = document.getElementById(owns)
    if (box && (box.getAttribute('role') === 'listbox' || box.querySelector('[role="option"]'))) return true
  }
  return false
}

// Récupère les options actuellement présentes dans le DOM, ou null si introuvables.
function getComboboxOptions(el) {
  // <datalist> natif
  if (el.list && el.list.options?.length) {
    return [...el.list.options]
      .map(o => ({ text: (o.label || o.value || o.textContent || '').trim(), value: o.value, el: o, native: true }))
      .filter(o => o.text)
  }
  // Listbox ARIA référencée par aria-controls / aria-owns
  const ownsId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns')
  if (ownsId) {
    const box = document.getElementById(ownsId)
    if (box) {
      const opts = [...box.querySelectorAll('[role="option"], option, li')]
        .map(o => ({ text: o.textContent?.trim() || '', el: o }))
        .filter(o => o.text)
      if (opts.length) return opts
    }
  }
  return null
}

// Tente de sélectionner l'option correspondant à `value`. Retourne false si les
// options sont introuvables ou si aucune ne correspond (→ on laisse l'utilisateur).
function selectComboboxOption(el, value) {
  if (!value) return false
  const options = getComboboxOptions(el)
  if (!options || !options.length) return false
  const target = value.trim().toLowerCase()
  const match = options.find(o => o.text.toLowerCase() === target)
    || options.find(o => o.text.toLowerCase().startsWith(target))
    || options.find(o => o.text.toLowerCase().includes(target) || target.includes(o.text.toLowerCase()))
  if (!match) return false
  if (match.native) {
    // <datalist> : on renseigne directement la valeur de l'input
    injectAnswer(el, match.value || match.text)
  } else {
    el.focus()
    match.el.scrollIntoView({ block: 'nearest' })
    match.el.click()
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return true
}

// ── 2.2 Injection des réponses dans les champs ────────────────────────────────
function injectAnswer(el, text) {
  el.focus()

  // contenteditable (rich-text editors) — the native value-setter path below
  // throws on non input/textarea elements, so handle it separately.
  if (el.isContentEditable) {
    try {
      el.textContent = ''
      document.execCommand('selectAll', false, null)
      document.execCommand('insertText', false, text)
    } catch {}
    if (!(el.textContent || '').trim()) el.textContent = text
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
    return
  }

  // Ashby/React requires simulating actual keystrokes via execCommand or
  // overriding the native setter AND dispatching a React-compatible InputEvent
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

  if (nativeSetter) {
    nativeSetter.call(el, text)
  } else {
    el.value = text
  }

  // React 16+ uses SyntheticEvent — InputEvent with inputType works best
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))

  // Fallback: select all + execCommand (works on contenteditable too)
  try {
    el.select?.()
    document.execCommand('selectAll', false, null)
    document.execCommand('insertText', false, text)
  } catch {}

  el.dispatchEvent(new Event('blur', { bubbles: true }))
}

// ── 2.2b Type-aware apply + read-back verification ────────────────────────────
// Read the current effective value of any control, so we can confirm a write
// actually stuck (React controlled inputs sometimes revert on first re-render).
function readFieldValue(el) {
  if (!el) return ''
  if (el.isContentEditable) return el.textContent || ''
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? (el.value || 'on') : ''
  return el.value || ''
}

function applyTextValue(el, text) {
  if (!text) return false
  injectAnswer(el, text)
  if (!readFieldValue(el).trim()) injectAnswer(el, text)  // one retry
  return readFieldValue(el).trim().length > 0
}

function applySelectValue(el, value) {
  const target = (value || '').trim().toLowerCase()
  if (!target) return false
  const opts = [...el.options]
  const match = opts.find(o => (o.textContent || '').trim().toLowerCase() === target)
    || opts.find(o => (o.value || '').trim().toLowerCase() === target)
    || opts.find(o => (o.textContent || '').trim().toLowerCase().includes(target))
  if (!match) return false
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
  setter ? setter.call(el, match.value) : (el.value = match.value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return el.value === match.value
}

function applyRadioValue(field, value) {
  const target = (value || '').trim().toLowerCase()
  if (!target) return false
  const opts = field.options || []
  const match = opts.find(o => o.text.trim().toLowerCase() === target)
    || opts.find(o => { const t = o.text.trim().toLowerCase(); return t.includes(target) || target.includes(t) })
  if (!match || !match.el) return false
  match.el.focus?.()
  match.el.click()
  if (!match.el.checked) {
    match.el.checked = true
    match.el.dispatchEvent(new Event('input', { bubbles: true }))
    match.el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return !!match.el.checked
}

const JT_CHECK_TRUE = ['yes', 'oui', 'true', '1', 'on', 'checked', 'accept', 'accepté', 'accepte', 'agree', "j'accepte", 'y', 'coché', 'coche']
function applyCheckboxValue(el, value) {
  const v = (value == null ? '' : value).toString().trim().toLowerCase()
  const shouldCheck = JT_CHECK_TRUE.includes(v)
  if (el.checked !== shouldCheck) el.click()
  if (el.checked !== shouldCheck) {
    el.checked = shouldCheck
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return true
}

// Route a resolved value to the right control; returns true if it was applied.
function applyFieldValue(field, value) {
  switch (field.control) {
    case 'select':   return applySelectValue(field.el, value)
    case 'combobox': return selectComboboxOption(field.el, value)
    case 'radio':    return applyRadioValue(field, value)
    case 'checkbox': return applyCheckboxValue(field.el, value)
    default:         return applyTextValue(field.el, value)
  }
}

// ── 2.3 Per-field ✦ buttons ───────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Mount a trusted HTML string (dynamic parts already run through escHtml) without
// assigning innerHTML. DOMParser builds an inert document — it never executes
// scripts and the AMO validator does not flag it — then we move the nodes into the
// target (element or shadow root), so the UI renders identically with a clean
// "no unsafe innerHTML" report.
function jtSetHTML(root, html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  root.replaceChildren(...doc.head.childNodes, ...doc.body.childNodes)
}

function highlightField(el, type) {
  el.style.outline = type === 'success' ? '2px solid #22c55e' : '2px solid #ef4444'
  setTimeout(() => { el.style.outline = '' }, 2000)
}

function injectStyles() {
  if (document.getElementById('jt-autofill-styles')) return
  const style = document.createElement('style')
  style.id = 'jt-autofill-styles'
  style.textContent = `
    .jt-field-btn {
      position: absolute;
      width: 22px; height: 22px;
      background: #18181b;
      color: #a78bfa;
      border: none;
      border-radius: 5px;
      font-size: 12px;
      line-height: 22px;
      text-align: center;
      cursor: pointer;
      pointer-events: all;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      font-family: sans-serif;
      user-select: none;
      padding: 0;
    }
    .jt-field-btn:hover { background: #3730a3; transform: scale(1.1); }
    .jt-field-btn.jt-done { background: #16a34a; color: #fff; }

    .jt-popover {
      position: fixed;
      z-index: 2147483647;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #18181b;
      max-height: 90vh;
      overflow-y: auto;
    }
    .jt-pop-header {
      background: #18181b; color: #fff;
      padding: 10px 14px;
      display: flex; align-items: center; justify-content: space-between;
      font-weight: 600; font-size: 12px;
    }
    .jt-pop-close { background:none;border:none;color:#9ca3af;cursor:pointer;font-size:14px;line-height:1; }
    .jt-pop-close:hover { color:#fff; }
    .jt-pop-label { padding: 10px 14px 4px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    .jt-pop-preview {
      margin: 0 14px 10px;
      padding: 8px 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 12px;
      color: #374151;
      max-height: 100px;
      overflow-y: auto;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .jt-pop-actions { display:flex; gap:8px; padding: 0 14px 12px; }
    .jt-pop-btn {
      flex:1; padding:7px 10px; border-radius:8px; font-size:12px; font-weight:600;
      cursor:pointer; border:none; transition:opacity 0.15s;
    }
    .jt-pop-generate { background:#18181b; color:#fff; }
    .jt-pop-generate:hover:not(:disabled) { opacity:0.85; }
    .jt-pop-generate:disabled { opacity:0.4; cursor:default; }
    .jt-pop-inject { background:#f3f4f6; color:#18181b; border:1px solid #e5e7eb; }
    .jt-pop-inject:hover:not(:disabled) { background:#e5e7eb; }
    .jt-pop-inject:disabled { opacity:0.4; cursor:default; }
    .jt-pop-status { padding: 4px 14px 8px; font-size: 11px; min-height: 18px; color: #6b7280; }
    .jt-pop-status.ok { color: #16a34a; }
    .jt-pop-status.err { color: #dc2626; }
    .jt-pop-context { padding: 0 14px 10px; }
    .jt-pop-context label { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 4px; }
    .jt-pop-context textarea { width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; font-size: 11px; color: #374151; min-height: 60px; resize: vertical; font-family: inherit; }
    .jt-pop-context textarea:focus { border-color: #a78bfa; outline: none; }
  `
  document.head.appendChild(style)
}

// Track per-field state: fieldKey → { btn, popover, answer }
const fieldState = new Map()
let activePopover = null
let cachedJD = null

function fieldKey(el) {
  return el.name || el.id || el.placeholder || el.closest('form')?.action || Math.random()
}

async function getJD() {
  if (cachedJD !== null) return cachedJD
  const rawPath = window.location.pathname.replace(/\/(apply|application|form|candidature|submit)(\/.*)$/i, '').replace(/\/+$/, '')
  const jdKey = 'jd:' + window.location.hostname + rawPath
  try {
    const r = await Promise.race([
      browser.runtime.sendMessage({ type: 'LOAD_JD', key: jdKey }),
      new Promise((_, rej) => setTimeout(() => rej(), 1500))
    ])
    if (r?.text && r.text.length > 80) { cachedJD = r.text; return cachedJD }
  } catch {}
  const targeted = getJobDescription()
  if (targeted && targeted.length > 80) { cachedJD = targeted.slice(0, 12000); return cachedJD }
  cachedJD = getFullPageText().slice(0, 12000)
  return cachedJD
}

function positionNearField(btn, popover) {
  const rect = btn.getBoundingClientRect()
  // Measure the real popover size — it varies with content (context box,
  // generated answer, action buttons). A hardcoded height clipped the
  // bottom buttons off-screen for fields near the viewport bottom.
  const popRect = popover.getBoundingClientRect()
  const pw = popRect.width || 300
  const ph = popRect.height || 240
  const margin = 8
  let left = rect.right + 10
  let top = rect.top - 10
  if (left + pw > window.innerWidth - margin) left = rect.left - pw - 10
  if (left < margin) left = margin
  // Clamp vertically using the measured height so the whole popover,
  // including the Générer/Injecter buttons, stays inside the viewport.
  if (top + ph > window.innerHeight - margin) top = window.innerHeight - ph - margin
  if (top < margin) top = margin
  popover.style.left = left + 'px'
  popover.style.top = top + 'px'
}

async function openFieldPopover(field, btn) {
  // Close any open popover
  if (activePopover && document.contains(activePopover)) {
    activePopover.remove()
  }
  activePopover = null

  const state = fieldState.get(field.el) || {}
  const jobInfo = extractJobInfo()
  const identityValues = await getIdentityValues()

  const popover = document.createElement('div')
  popover.className = 'jt-popover'
  activePopover = popover

  const identVal = field.identityKey ? identityValues[field.identityKey] : null

  // Build header safely
  const header = document.createElement('div')
  header.className = 'jt-pop-header'
  const headerTitle = document.createElement('span')
  headerTitle.textContent = '✦ ' + field.label.slice(0, 50) + (field.label.length > 50 ? '…' : '')
  const closeBtn = document.createElement('button')
  closeBtn.className = 'jt-pop-close'
  closeBtn.textContent = '✕'
  header.appendChild(headerTitle)
  header.appendChild(closeBtn)
  popover.appendChild(header)

  // Build content safely based on field type
  if (identVal !== null) {
    const label = document.createElement('div')
    label.className = 'jt-pop-label'
    label.textContent = 'Valeur identité'
    const preview = document.createElement('div')
    preview.className = 'jt-pop-preview'
    preview.textContent = identVal
    const actions = document.createElement('div')
    actions.className = 'jt-pop-actions'
    const injectBtn = document.createElement('button')
    injectBtn.className = 'jt-pop-btn jt-pop-inject'
    injectBtn.id = 'jt-pop-inject'
    injectBtn.textContent = '↓ Injecter'
    actions.appendChild(injectBtn)
    popover.appendChild(label)
    popover.appendChild(preview)
    popover.appendChild(actions)
  } else {
    const contextLabel = document.createElement('div')
    contextLabel.className = 'jt-pop-label'
    contextLabel.textContent = 'Contexte (optionnel)'
    const contextDiv = document.createElement('div')
    contextDiv.className = 'jt-pop-context'
    const textarea = document.createElement('textarea')
    textarea.id = 'jt-pop-context'
    textarea.placeholder = 'Ajoutez du contexte pour cette réponse...'
    contextDiv.appendChild(textarea)

    const genLabel = document.createElement('div')
    genLabel.className = 'jt-pop-label'
    genLabel.textContent = 'Réponse générée'
    const preview = document.createElement('div')
    preview.id = 'jt-pop-preview'
    preview.className = 'jt-pop-preview'
    preview.textContent = state.answer || 'Cliquez Générer pour créer une réponse IA'

    const actions = document.createElement('div')
    actions.className = 'jt-pop-actions'
    const genBtn = document.createElement('button')
    genBtn.className = 'jt-pop-btn jt-pop-generate'
    genBtn.id = 'jt-pop-gen'
    genBtn.textContent = state.answer ? '↺ Regénérer' : '⚡ Générer'
    const injectBtn = document.createElement('button')
    injectBtn.className = 'jt-pop-btn jt-pop-inject'
    injectBtn.id = 'jt-pop-inject'
    injectBtn.textContent = '↓ Injecter'
    if (!state.answer) injectBtn.disabled = true
    actions.appendChild(genBtn)
    actions.appendChild(injectBtn)

    const status = document.createElement('div')
    status.id = 'jt-pop-status'
    status.className = 'jt-pop-status'

    popover.appendChild(contextLabel)
    popover.appendChild(contextDiv)
    popover.appendChild(genLabel)
    popover.appendChild(preview)
    popover.appendChild(actions)
    popover.appendChild(status)
  }

  document.body.appendChild(popover)
  positionNearField(btn, popover)

  // Cleanup function to ensure proper removal
  function closePopover() {
    if (document.contains(popover)) {
      popover.remove()
    }
    if (activePopover === popover) {
      activePopover = null
    }
    document.removeEventListener('click', onOutside)
  }

  popover.querySelector('.jt-pop-close').addEventListener('click', closePopover)

  if (identVal !== null) {
    popover.querySelector('#jt-pop-inject').addEventListener('click', () => {
      injectAnswer(field.el, identVal)
      highlightField(field.el, 'success')
      btn.textContent = '✓'
      btn.classList.add('jt-done')
      closePopover()
    })

    // Close on outside click
    const onOutside = (e) => {
      if (!popover.contains(e.target) && e.target !== btn && document.contains(popover)) {
        closePopover()
      }
    }
    document.addEventListener('click', onOutside)
    return
  }

  // AI generate
  const genBtn = popover.querySelector('#jt-pop-gen')
  const injectBtn = popover.querySelector('#jt-pop-inject')
  const preview = popover.querySelector('#jt-pop-preview')
  const status = popover.querySelector('#jt-pop-status')

  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true
    genBtn.textContent = '⏳ Génération…'
    status.textContent = 'Appel à Claude AI…'
    status.className = 'jt-pop-status'

    try {
      const jdText = await getJD()
      const contextEl = popover.querySelector('#jt-pop-context')
      const fieldContext = contextEl ? contextEl.value.trim() : ''
      const jobContext = [
        `Entreprise: ${jobInfo.company}`,
        `Poste: ${jobInfo.position}`,
        jdText ? `Description:\n${jdText.slice(0, 3500)}` : '',
        fieldContext ? `Contexte spécifique du candidat pour ce champ:\n${fieldContext}` : ''
      ].filter(Boolean).join('\n')

      const response = await browser.runtime.sendMessage({
        type: 'AUTOFILL_REQUEST',
        fields: [{ label: field.label, type: field.type, maxLength: field.maxLength, placeholder: field.placeholder }],
        jobContext
      })

      if (response.error) throw new Error(response.error)
      const text = response.answers?.[0]?.text || ''
      if (!text) throw new Error('Réponse vide')

      state.answer = text
      fieldState.set(field.el, state)
      preview.textContent = text
      injectBtn.disabled = false
      genBtn.textContent = '↺ Regénérer'
      genBtn.disabled = false
      status.textContent = '✓ Généré'
      status.className = 'jt-pop-status ok'
      // The popover grew taller now that the answer is rendered — reposition
      // so the Injecter button stays inside the viewport.
      positionNearField(btn, popover)
    } catch (e) {
      status.textContent = 'Erreur : ' + e.message.slice(0, 60)
      status.className = 'jt-pop-status err'
      genBtn.textContent = '⚡ Réessayer'
      genBtn.disabled = false
    }
  })

  injectBtn.addEventListener('click', () => {
    const text = fieldState.get(field.el)?.answer || ''
    if (!text) return
    injectAnswer(field.el, text)
    highlightField(field.el, 'success')
    btn.textContent = '✓'
    btn.classList.add('jt-done')
    status.textContent = '✓ Injecté'
    status.className = 'jt-pop-status ok'
    setTimeout(() => closePopover(), 800)
  })

  // Close on outside click
  const onOutside = (e) => {
    if (!popover.contains(e.target) && e.target !== btn && document.contains(popover)) {
      closePopover()
    }
  }
  document.addEventListener('click', onOutside)
}

let jtOverlay = null

function getOverlay() {
  if (jtOverlay && document.contains(jtOverlay)) return jtOverlay
  jtOverlay = document.createElement('div')
  jtOverlay.id = 'jt-overlay'
  jtOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;'
  document.body.appendChild(jtOverlay)
  return jtOverlay
}

function placeFieldButton(field) {
  if (fieldState.has(field.el) && document.contains(fieldState.get(field.el).btn)) return

  const btn = document.createElement('button')
  btn.className = 'jt-field-btn'
  btn.textContent = '✦'
  btn.title = 'JobTrackr Autofill'
  getOverlay().appendChild(btn)

  fieldState.set(field.el, { btn, answer: null })

  // Position loop — runs every frame, keeps button glued to field
  let frameCount = 0
  function tick() {
    if (!document.contains(field.el) || !document.contains(btn)) {
      return
    }
    const rect = field.el.getBoundingClientRect()
    frameCount++
    if (rect.width > 0 && rect.height > 0) {
      btn.style.display = 'block'
      btn.style.top = (rect.bottom - 28) + 'px'
      btn.style.left = (rect.right - 28) + 'px'
    } else {
      btn.style.display = 'none'
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  btn.addEventListener('click', e => {
    e.stopPropagation()
    e.preventDefault()
    openFieldPopover(field, btn).catch(err => {
      console.error('Error opening popover:', err)
      highlightField(field.el, 'error')
    })
  })
}

// ── 2.4 Init + MutationObserver ───────────────────────────────────────────────

let scanTimer = null

async function isAutofillEnabled() {
  try {
    const data = await browser.storage.local.get('autofillButtonsEnabled')
    return data.autofillButtonsEnabled !== false
  } catch {
    return true
  }
}

async function scanAndPlaceButtons() {
  const enabled = await isAutofillEnabled()
  if (!enabled) return
  const fields = detectFormFields()
  // ✦ button only on free-text fields — choice controls (select/radio/checkbox/
  // combobox) fill by selection, and file inputs stay with the user.
  fields.filter(f => f.control === 'text').forEach(f => placeFieldButton(f))
}

async function autoGenerateAllFields() {
  const allFields = detectFormFields({ deep: true })
  if (allFields.length === 0) {
    showNotification('❌ Aucun champ détecté', 'error')
    return
  }

  const identityValues = await getIdentityValues()
  let filled = 0
  let flagged = 0  // needs a human: file upload, or a value we couldn't apply

  // Pass 1 — identity fields (name/email/phone/…) filled locally, no AI.
  //          File inputs are flagged: the CV upload stays with the user.
  const aiFields = []
  for (const f of allFields) {
    if (f.control === 'file') { highlightField(f.el, 'error'); flagged++; continue }
    const idVal = f.identityKey ? identityValues[f.identityKey] : null
    if (idVal && applyFieldValue(f, idVal)) { highlightField(f.el, 'success'); filled++; continue }
    aiFields.push(f)
  }

  // Pass 2 — everything else in ONE batched AI call. Whole-form context keeps
  // answers consistent, and the CV is attached server-side in background.js.
  if (aiFields.length) {
    showNotification(`⏳ Génération (${aiFields.length} champ${aiFields.length > 1 ? 's' : ''})…`, 'info')

    const jobInfo = extractJobInfo()
    const jdText = await getJD()
    const jobContext = [
      `Entreprise: ${jobInfo.company}`,
      `Poste: ${jobInfo.position}`,
      jdText ? `Description:\n${jdText.slice(0, 3500)}` : ''
    ].filter(Boolean).join('\n')

    const payload = aiFields.map((f, i) => ({
      index: i,
      label: f.label,
      control: f.control === 'combobox' ? 'select' : f.control,
      type: f.type,
      maxLength: f.maxLength || null,
      placeholder: f.placeholder || '',
      options: (f.options || []).map(o => (o.text || '').trim()).filter(Boolean).slice(0, 30)
    }))

    let answers = []
    try {
      const resp = await browser.runtime.sendMessage({ type: 'AUTOFILL_REQUEST', fields: payload, jobContext })
      if (resp?.error) throw new Error(resp.error)
      answers = resp?.answers || []
    } catch (e) {
      showNotification('❌ ' + (e.message || 'Erreur').slice(0, 60), 'error')
    }

    const byIndex = new Map(answers.map(a => [a.fieldIndex != null ? a.fieldIndex : a.index, a]))
    for (let i = 0; i < aiFields.length; i++) {
      const f = aiFields[i]
      const a = byIndex.get(i)
      const raw = a ? (a.text != null ? a.text : a.value) : ''
      const clean = (raw || '').toString().trim()
      if (!clean || /^(skip|n\/?a|none)$/i.test(clean)) { highlightField(f.el, 'error'); flagged++; continue }
      if (applyFieldValue(f, clean)) { highlightField(f.el, 'success'); filled++ }
      else { highlightField(f.el, 'error'); flagged++ }
      await new Promise(r => setTimeout(r, 50))
    }
  }

  let msg = `✓ ${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''}`
  if (flagged) msg += ` · ${flagged} à vérifier`
  showNotification(msg, filled ? 'success' : 'error')
}

function showNotification(msg, type = 'info') {
  const notif = document.createElement('div')
  notif.textContent = msg
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483646;
    padding: 12px 16px;
    background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
  `
  document.body.appendChild(notif)
  setTimeout(() => notif.remove(), 3000)
}

let autofillObserver = null

async function initAutofill() {
  injectStyles()
  const enabled = await isAutofillEnabled()
  if (enabled) {
    await scanAndPlaceButtons()
  }

  autofillObserver = new MutationObserver(() => {
    clearTimeout(scanTimer)
    scanTimer = setTimeout(scanAndPlaceButtons, 350)
  })
  autofillObserver.observe(document.body, { childList: true, subtree: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 : Message listener (existant + nouveau AUTOFILL_REQUEST)
// ─────────────────────────────────────────────────────────────────────────────

// Cross-browser reply pattern: call sendResponse() synchronously and `return
// true`. Firefox also supports returning a Promise, but Chrome does not — it
// ignores the returned Promise and the sender gets `undefined`. sendResponse +
// `return true` works on both. Frames that shouldn't answer return a falsy value
// so the message channel closes immediately (only the right frame replies).
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_JOB_INFO') {
    // Only the relevant frame answers, so an iframe can't hijack the response.
    if (!frameHoldsJob()) return false
    cachedJD = null
    // Async: on LinkedIn this resolves the selected job via the guest API.
    enrichJobInfo().then(info => { try { sendResponse(info) } catch (e) {} })
    return true
  }
  if (msg.type === 'GET_PAGE_TEXT') {
    if (!frameHoldsJob()) return false
    sendResponse({ text: getFullPageText() })
    return true
  }
  if (msg.type === 'GET_CLEANED_TEXT') {
    if (!frameHoldsJob()) return false
    sendResponse({ text: getFullPageText() })
    return true
  }
  // Déclencher l'autofill depuis le popup
  if (msg.type === 'TRIGGER_AUTOFILL') {
    cachedJD = null
    scanAndPlaceButtons()  // async, but fire-and-forget is ok here
    sendResponse({ fieldsCount: fieldState.size })
    return true
  }
  // Auto-generate and inject all fields
  if (msg.type === 'AUTO_GENERATE_ALL') {
    cachedJD = null
    autoGenerateAllFields()  // async, but fire-and-forget is ok here
    sendResponse({ success: true })
    return true
  }
  // Toggle autofill buttons visibility
  if (msg.type === 'TOGGLE_AUTOFILL_BUTTONS') {
    const isEnabled = msg.enabled
    if (isEnabled) {
      // Show buttons - fire-and-forget async call
      if (!jtOverlay || !document.contains(jtOverlay)) {
        scanAndPlaceButtons().catch(err => console.error('Autofill toggle error:', err))
      }
      // Ensure observer is active
      if (autofillObserver && !autofillObserver._enabled) {
        autofillObserver.observe(document.body, { childList: true, subtree: true })
      }
    } else {
      // Hide buttons immediately and pause observer
      const overlay = document.getElementById('jt-overlay')
      if (overlay) overlay.remove()
      jtOverlay = null
      fieldState.clear()
      if (activePopover && document.contains(activePopover)) {
        activePopover.remove()
      }
      activePopover = null
      // Pause observer to prevent re-adding buttons
      if (autofillObserver) {
        autofillObserver.disconnect()
        // Restart observer but with check in callback
        autofillObserver = new MutationObserver(() => {
          clearTimeout(scanTimer)
          scanTimer = setTimeout(async () => {
            const enabled = await isAutofillEnabled()
            if (enabled) scanAndPlaceButtons()
          }, 350)
        })
        autofillObserver.observe(document.body, { childList: true, subtree: true })
      }
    }
    sendResponse({ success: true })
    return true
  }
  // Scan the current listing/search page: enumerate the job cards, score each
  // against the synced CV, and show the review-then-add panel. Only the top frame
  // answers (the listing lives there); sub-frames stay silent so the top wins.
  if (msg.type === 'TRIGGER_SCAN') {
    if (window.top !== window) return false
    const cards = enumerateJobCards()
    sendResponse({ count: cards.length })
    if (cards.length) runListingScan(cards)  // async, renders its own panel
    return true
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 : Request JD from storage (via custom events)
// The app sends 'jobtrackr-jd-request' event with jdKey, we respond with data
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('jobtrackr-jd-request', async (e) => {
  const jdKey = e.detail?.jdKey
  if (!jdKey) return
  try {
    const result = await browser.runtime.sendMessage({ type: 'LOAD_JD', key: jdKey })
    // Serialize as JSON string to avoid cross-origin security errors
    window.dispatchEvent(new CustomEvent('jobtrackr-jd-response', { detail: JSON.stringify({ jdKey, text: result?.text || '' }) }))
  } catch (err) {
    window.dispatchEvent(new CustomEvent('jobtrackr-jd-response', { detail: JSON.stringify({ jdKey, text: '', error: err.message }) }))
  }
})

// The app sends 'jobtrackr-batch-request' with a batchKey when it lands on
// ?addBatch=1 (from the listing-scan "Ajouter la sélection"); we return the array
// of selected jobs stored under that key. Mirrors the JD bridge above.
window.addEventListener('jobtrackr-batch-request', async (e) => {
  const batchKey = e.detail?.batchKey
  if (!batchKey) return
  try {
    const result = await browser.runtime.sendMessage({ type: 'LOAD_BATCH', key: batchKey })
    window.dispatchEvent(new CustomEvent('jobtrackr-batch-response', { detail: JSON.stringify({ batchKey, jobs: result?.jobs || [] }) }))
  } catch (err) {
    window.dispatchEvent(new CustomEvent('jobtrackr-batch-response', { detail: JSON.stringify({ batchKey, jobs: [], error: err.message }) }))
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 : Floating CV↔job match score pill (bottom-right)
// A self-contained overlay: a colour-coded score pill that expands into a card
// with the summary, strengths and gaps. It scores automatically (via the
// background, which shares the popup's cache) and only appears on job pages when
// a CV is synced. All markup lives in a Shadow DOM so host-page CSS can't touch it.
// ─────────────────────────────────────────────────────────────────────────────

const JT_SCORE_HOSTS = [
  'linkedin.com', 'indeed.com', 'welcometothejungle.com', 'apec.fr', 'hellowork.com',
  'pole-emploi.fr', 'monster.fr', 'glassdoor.com', 'cadremploi.fr', 'regionsjob.com',
  'meteojob.com', ...ATS_HOSTS
]

function jtScoreColor(s) { return s >= 80 ? '#16a34a' : s >= 60 ? '#2563eb' : s >= 40 ? '#d97706' : '#dc2626' }
function jtScoreLabel(s) { return s >= 80 ? 'Excellent match' : s >= 60 ? 'Bon match' : s >= 40 ? 'Match partiel' : 'Match faible' }

// A JobTrackr status maps to a French label. Statuses at/after the application
// stage let us say "Déjà postulé"; earlier ones (saved/to-do) say "Déjà suivi".
const JT_STATUS_LABELS = {
  todo: 'À postuler', to_apply: 'À postuler', saved: 'Sauvegardé', prospect: 'Prospect',
  applied: 'Postulé', candidature: 'Postulé', sent: 'Postulé',
  relance: 'Relancé', followup: 'Relancé',
  interview: 'Entretien', entretien: 'Entretien',
  offer: 'Offre', offre: 'Offre',
  accepted: 'Accepté', accepte: 'Accepté',
  rejected: 'Refusé', refus: 'Refusé', refuse: 'Refusé',
  archived: 'Archivé'
}
const JT_APPLIED_STAGES = new Set(['applied', 'candidature', 'sent', 'relance', 'followup', 'interview', 'entretien', 'offer', 'offre', 'accepted', 'accepte', 'rejected', 'refus', 'refuse'])
function jtStatusKey(s) { return (s || '').toString().trim().toLowerCase() }
function jtStatusLabel(s) { const k = jtStatusKey(s); return JT_STATUS_LABELS[k] || (s ? s.toString() : '') }
function jtIsAppliedStage(s) { return JT_APPLIED_STAGES.has(jtStatusKey(s)) }
function jtFmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '' }
}

let jtScoreHost = null, jtScoreShadow = null
let jtScoreOpen = false, jtScoreBusy = false
let jtLastScoreUrl = null, jtScoreData = null
let jtApplied = null  // { status, date, company, position } when the current page is already in JobTrackr

// Ask the background whether this posting is already tracked in JobTrackr.
async function jtCheckApplied(info) {
  try {
    const res = await browser.runtime.sendMessage({
      type: 'CHECK_APPLIED',
      url: window.location.href,
      company: (info && info.company) || '',
      position: (info && info.position) || ''
    })
    jtApplied = (res && res.applied) ? res : null
  } catch {
    jtApplied = null
  }
}

function jtLooksLikeJobPage() {
  try {
    const host = window.location.hostname.replace('www.', '')
    if (JT_SCORE_HOSTS.some(h => host.includes(h))) return true
    return [...document.querySelectorAll('script[type="application/ld+json"]')]
      .some(s => /"@type"\s*:\s*"JobPosting"/i.test(s.textContent || ''))
  } catch { return false }
}

async function jtCvPresent() {
  try { return !!(await browser.storage.local.get('cvText')).cvText } catch { return false }
}
async function jtScoreEnabled() {
  try { return (await browser.storage.local.get('scorePillEnabled')).scorePillEnabled !== false } catch { return true }
}

function jtRemoveScorePill() {
  if (jtScoreHost && jtScoreHost.parentNode) jtScoreHost.parentNode.removeChild(jtScoreHost)
  jtScoreHost = null; jtScoreShadow = null
}

function jtEnsureScoreHost() {
  if (jtScoreHost && document.contains(jtScoreHost)) return
  jtScoreHost = document.createElement('div')
  jtScoreHost.id = 'jt-score-host'
  jtScoreHost.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000;'
  jtScoreShadow = jtScoreHost.attachShadow({ mode: 'open' })
  document.body.appendChild(jtScoreHost)
}

function jtRenderScorePill(state) {
  jtEnsureScoreHost()
  const loading = !!state.loading
  const s = state.result || null
  const score = s ? Math.round(s.score) : null
  const color = score != null ? jtScoreColor(score) : '#64748b'
  const label = score != null ? jtScoreLabel(score) : 'Calcul du score…'
  const verdict = s && s.verdict ? String(s.verdict).replace(/_/g, ' ') : label
  const summary = s ? escHtml(s.summary || '') : ''
  const strengths = (s && s.strengths || []).map(x => `<li><i class="c">✓</i><span>${escHtml(x)}</span></li>`).join('')
  const gaps = (s && s.gaps || []).map(x => `<li><i class="w">!</i><span>${escHtml(x)}</span></li>`).join('')
  // When the posting is already in the user's JobTrackr, the pill LEADS with that
  // ("Déjà postulé") instead of the match score — the applied state is what the
  // user needs to see first. The score moves to the sub-line and the detail card.
  const appliedActive = !!jtApplied && !loading
  const appliedHead = jtApplied ? (jtIsAppliedStage(jtApplied.status) ? 'Déjà postulé' : 'Déjà dans JobTrackr') : ''
  const appliedMeta = jtApplied
    ? [jtApplied.status ? jtStatusLabel(jtApplied.status) : '', jtFmtDate(jtApplied.date)].filter(Boolean).join(' · ')
    : ''

  const pillBadgeBg = appliedActive ? '#10b981' : color
  const pillBadgeInner = loading ? '<span class="jt-spin"></span>' : (appliedActive ? '✓' : (score != null ? score : '–'))
  const pillLabel = appliedActive ? appliedHead : label
  const pillSub = loading
    ? 'Analyse en cours'
    : (appliedActive
        ? [appliedMeta, (score != null ? 'Score ' + score : '')].filter(Boolean).join(' · ')
        : (jtScoreOpen ? 'Masquer les détails' : 'Voir les détails'))

  const card = (jtScoreOpen && s) ? `
    <div class="jt-card">
      <div class="jt-card-head">
        <span class="jt-badge jt-badge-sm" style="background:${color}">${score}</span>
        <span class="jt-card-verdict">${escHtml(verdict)}</span>
        <button class="jt-x" id="jt-close" aria-label="Réduire">✕</button>
      </div>
      <p class="jt-summary">${summary}</p>
      ${strengths ? `<div class="jt-sec-title jt-ok">Points forts</div><ul class="jt-list">${strengths}</ul>` : ''}
      ${gaps ? `<div class="jt-sec-title jt-warn">Lacunes</div><ul class="jt-list">${gaps}</ul>` : ''}
      <div class="jt-actions">
        <button class="jt-act jt-recalc" id="jt-recalc">↺ Recalculer</button>
        <button class="jt-act jt-add" id="jt-add">${jtApplied ? '✓ Dans JobTrackr' : '＋ JobTrackr'}</button>
      </div>
    </div>` : ''

  jtSetHTML(jtScoreShadow, `
    <style>
      :host, * { box-sizing: border-box; }
      .jt-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
      .jt-pill { display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; box-shadow: 0 6px 18px rgba(15,23,42,0.16); cursor: pointer; }
      .jt-pill:hover { box-shadow: 0 8px 22px rgba(15,23,42,0.22); }
      .jt-badge { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 16px; flex-shrink: 0; }
      .jt-badge-sm { width: 44px; height: 44px; border-radius: 12px; font-size: 19px; }
      .jt-pill-txt { text-align: left; line-height: 1.2; }
      .jt-pill-lbl { display: block; font-size: 13px; font-weight: 600; color: #0f172a; }
      .jt-pill-sub { display: block; font-size: 11px; color: #94a3b8; }
      .jt-chev { color: #cbd5e1; font-size: 13px; margin-left: 2px; }
      .jt-card { width: 290px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 12px 34px rgba(15,23,42,0.2); overflow: hidden; }
      .jt-card-head { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-bottom: 1px solid #f1f5f9; }
      .jt-card-verdict { font-size: 13px; font-weight: 600; color: #0f172a; text-transform: capitalize; }
      .jt-x { margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 15px; line-height: 1; padding: 2px; }
      .jt-x:hover { color: #0f172a; }
      .jt-summary { font-size: 12px; line-height: 1.5; color: #475569; margin: 12px 14px; }
      .jt-sec-title { font-size: 11px; font-weight: 600; margin: 10px 14px 6px; }
      .jt-ok { color: #15803d; } .jt-warn { color: #b45309; }
      .jt-list { list-style: none; padding: 0 14px; margin: 0 0 6px; }
      .jt-list li { display: flex; gap: 8px; font-size: 12px; line-height: 1.45; margin-bottom: 5px; color: #334155; }
      .jt-list i { font-style: normal; font-weight: 700; flex-shrink: 0; }
      .jt-list i.c { color: #16a34a; } .jt-list i.w { color: #d97706; }
      .jt-actions { display: flex; gap: 8px; padding: 11px 14px; border-top: 1px solid #f1f5f9; }
      .jt-act { flex: 1; font: inherit; font-size: 12px; font-weight: 600; padding: 8px; border-radius: 8px; cursor: pointer; }
      .jt-recalc { border: 1px solid #c7d2fe; background: #eef2ff; color: #4338ca; }
      .jt-add { border: none; background: #4f46e5; color: #fff; }
      .jt-act:disabled { opacity: .55; cursor: default; }
      .jt-spin { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.5); border-top-color: #fff; border-radius: 50%; display: inline-block; animation: jt-rot .8s linear infinite; }
      @keyframes jt-rot { to { transform: rotate(360deg); } }
      .jt-applied { display: inline-flex; align-items: center; gap: 8px; max-width: 300px; background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; border-radius: 999px; padding: 6px 12px 6px 8px; box-shadow: 0 4px 12px rgba(15,23,42,0.12); }
      .jt-applied-ic { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #10b981; color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0; }
      .jt-applied-txt { display: flex; flex-direction: column; line-height: 1.25; font-size: 12px; }
      .jt-applied-txt b { font-weight: 700; }
      .jt-applied-meta { font-size: 10px; opacity: 0.85; text-transform: capitalize; }
    </style>
    <div class="jt-wrap">
      ${card}
      <button class="jt-pill" id="jt-pill" ${loading ? 'disabled' : ''}>
        <span class="jt-badge" style="background:${pillBadgeBg}">${pillBadgeInner}</span>
        <span class="jt-pill-txt">
          <span class="jt-pill-lbl">${escHtml(pillLabel)}</span>
          <span class="jt-pill-sub">${escHtml(pillSub)}</span>
        </span>
        <span class="jt-chev">${jtScoreOpen ? '▾' : '▴'}</span>
      </button>
    </div>`)

  const pill = jtScoreShadow.getElementById('jt-pill')
  if (pill && !loading) pill.addEventListener('click', () => { jtScoreOpen = !jtScoreOpen; jtRenderScorePill({ result: jtScoreData }) })
  const closeBtn = jtScoreShadow.getElementById('jt-close')
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); jtScoreOpen = false; jtRenderScorePill({ result: jtScoreData }) })
  const recalc = jtScoreShadow.getElementById('jt-recalc')
  if (recalc) recalc.addEventListener('click', (e) => { e.stopPropagation(); runScoreFlow(true) })
  const add = jtScoreShadow.getElementById('jt-add')
  if (add) add.addEventListener('click', async (e) => {
    e.stopPropagation()
    // Already tracked → open JobTrackr rather than creating a duplicate.
    if (jtApplied) {
      try {
        const r = await browser.runtime.sendMessage({ type: 'GET_APP_URL' })
        await browser.runtime.sendMessage({ type: 'OPEN_APP_TAB', url: r?.appUrl || 'https://jobtracking-three.vercel.app' })
      } catch {}
      return
    }
    add.disabled = true; add.textContent = '⏳ Ajout…'
    try {
      const job = jtScoreData?._job || extractJobInfo()
      const url = job.url || window.location.href
      await browser.runtime.sendMessage({ type: 'ADD_JOB', job: { company: job.company, position: job.position, description: job.description, url } })
      add.textContent = '✓ Ajouté'
      // Reflect it right away so the badge appears without waiting for a re-check.
      jtApplied = { applied: true, status: 'todo', date: new Date().toISOString(), company: job.company, position: job.position }
      jtRenderScorePill({ result: jtScoreData })
    } catch { add.textContent = '❌ Erreur'; add.disabled = false }
  })
}

async function runScoreFlow(force = false) {
  if (window.top !== window) return
  if (jtScoreBusy) return
  if (!(await jtScoreEnabled())) { jtRemoveScorePill(); return }
  if (!jtLooksLikeJobPage()) return
  if (!(await jtCvPresent())) { jtRemoveScorePill(); return }

  const info = await enrichJobInfo()
  if (!info.company || !info.position) return
  const url = info.url || window.location.href
  if (!force && url === jtLastScoreUrl && jtScoreData) return

  jtLastScoreUrl = url
  jtScoreBusy = true
  jtApplied = null  // clear any badge from a previously-scored posting
  jtRenderScorePill({ loading: true })
  try {
    // Check "already applied" in parallel with scoring so it never adds latency.
    const appliedP = jtCheckApplied(info)
    const res = await browser.runtime.sendMessage({
      type: 'COMPUTE_SCORE',
      company: info.company, position: info.position, description: info.description, url, force
    })
    await appliedP
    if (!res || res.error || res.noCv || res.insufficient || typeof res.score !== 'number') {
      jtScoreData = null
      jtRemoveScorePill()
      return
    }
    jtScoreData = { ...res, _job: info, _url: url }
    jtRenderScorePill({ result: res })
  } catch {
    jtRemoveScorePill()
  } finally {
    jtScoreBusy = false
  }
}

// Boot the pill in the top frame + re-run on SPA URL changes (LinkedIn/Indeed
// swap the job without a full reload).
function jtBootScorePill() {
  if (window.top !== window) return
  setTimeout(() => runScoreFlow().catch(() => {}), 1600)
  let last = location.href
  setInterval(() => {
    if (location.href !== last) {
      last = location.href
      jtScoreOpen = false
      setTimeout(() => runScoreFlow().catch(() => {}), 1200)
    }
  }, 1500)
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 : Listing-page scan → batch CV-fit score → review-then-add panel
// Enumerate every offer on a search/results page (LinkedIn / Indeed / HelloWork),
// score them all against the synced CV in ONE Claude call (via the background),
// and show a ranked, checkbox review panel. Selected offers are batch-added to
// JobTrackr. All markup lives in a Shadow DOM so host-page CSS can't touch it.
// ─────────────────────────────────────────────────────────────────────────────

// First matching descendant's collapsed text, or ''.
function jtCardText(root, selectors) {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel)
      const t = el?.textContent?.replace(/\s+/g, ' ').trim()
      if (t) return t
    } catch {}
  }
  return ''
}
function jtAbsUrl(href) { try { return new URL(href, location.href).href } catch { return href || '' } }

// Enumerate the job cards on a listing/search page. Returns up to 25
// { url, title, company, location, snippet } — card-level fields only (the full
// JD lives behind a click on these SPAs; the batch score is a triage/ranking).
function enumerateJobCards() {
  const host = location.hostname.replace('www.', '')
  const out = []
  const seen = new Set()
  const push = (job) => {
    let title = (job.title || '').replace(/\s+/g, ' ').trim()
    // LinkedIn duplicates the title (visible + a11y copy) → collapse an exact double.
    title = title.replace(/^(.{4,}?)\s*\1$/, '$1').trim()
    if (!title) return
    const key = (job.url && job.url.split('#')[0]) || (title + '|' + (job.company || ''))
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      url: job.url || '',
      title: title.slice(0, 160),
      company: (job.company || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      location: (job.location || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      snippet: cleanJobDescription((job.snippet || '').slice(0, 800)).slice(0, 400)
    })
  }

  if (host.includes('indeed.')) {
    document.querySelectorAll('.job_seen_beacon, td.resultContent').forEach(card => {
      // Indeed dropped h2.jobTitle: the title now lives on the a[data-jk] anchor
      // (role=button), which also carries the job key used to build the URL.
      const a = card.querySelector('h2.jobTitle a, a.jcs-JobTitle, a[data-jk]')
      const jk = a?.getAttribute('data-jk') || card.closest('[data-jk]')?.getAttribute('data-jk')
      const url = a?.getAttribute('href') ? jtAbsUrl(a.getAttribute('href')) : (jk ? `${location.origin}/viewjob?jk=${jk}` : '')
      push({
        url,
        title: jtCardText(card, ['h2.jobTitle span[title]', '[data-testid="jobTitle"]', 'span[id^="jobTitle"]', 'h2.jobTitle a', 'a[data-jk]']),
        company: jtCardText(card, ['[data-testid="company-name"]', '.companyName']),
        location: jtCardText(card, ['[data-testid="text-location"]', '.companyLocation']),
        snippet: jtCardText(card, ['[data-testid="jobsnippet_footer"]', '.job-snippet', '.underShelfFooter'])
      })
    })
  } else if (host.includes('linkedin.com')) {
    // LinkedIn ships several card DOMs (authenticated app, /jobs home redesign,
    // logged-out guest search) that change often — so we DON'T trust the card for
    // the title/company (a whole-card link would glue the entire card into the
    // title). We only need a stable job id here; the real title/company/location/JD
    // are filled reliably from the guest API by id in jtEnrichLinkedInCards().
    document.querySelectorAll('[data-occludable-job-id], .job-card-container, div[data-job-id], .job-card-job-posting-card-wrapper, .base-card, .base-search-card, ul.jobs-search__results-list > li').forEach(card => {
      const a = card.querySelector('a.base-card__full-link, a.job-card-container__link, a.job-card-list__title, a[href*="/jobs/view/"], a[href*="currentJobId="]')
      const idAttr = card.getAttribute('data-occludable-job-id') || card.getAttribute('data-job-id')
        || card.querySelector('[data-job-id]')?.getAttribute('data-job-id')
        || card.closest('[data-occludable-job-id]')?.getAttribute('data-occludable-job-id') || ''
      const jid = /^\d+$/.test(idAttr) ? idAttr : jtLinkedInJobId(a?.getAttribute('href') || '')
      if (!jid && !(a && a.getAttribute('href'))) return
      const url = jid ? `https://www.linkedin.com/jobs/view/${jid}/` : jtAbsUrl(a.getAttribute('href')).split('?')[0]
      // Specific title selectors ONLY (never a whole-card link). The guest API
      // overrides these; the placeholder just keeps the card until it does.
      let title = jtCardText(card, ['.base-search-card__title', '.job-card-list__title', '.artdeco-entity-lockup__title strong', '.artdeco-entity-lockup__title', '[class*="job-card-list__title"]'])
      if (!title && jid) title = 'Offre LinkedIn'
      push({
        url,
        title,
        company: jtCardText(card, ['.base-search-card__subtitle', '.artdeco-entity-lockup__subtitle', '.job-card-container__primary-description']),
        location: jtCardText(card, ['.job-search-card__location', '.job-card-container__metadata-item']),
        snippet: ''
      })
    })
  } else if (host.includes('hellowork')) {
    // HelloWork serp card: [data-cy="offerTitle"] holds the title in its first <p>
    // and the company in its last <p>; the whole card links to …/emplois/<id>.html.
    document.querySelectorAll('[data-cy="serpCard"], [data-id-storage-target="item"]').forEach(card => {
      const a = card.querySelector('a[href*="/emplois/"]')
      if (!a) return
      push({
        url: jtAbsUrl(a.getAttribute('href')),
        title: jtCardText(card, ['[data-cy="offerTitle"] p:first-child', '[data-cy="offerTitle"]', '[data-cy="jobTitle"]', 'h3', 'h2']) || a.textContent.replace(/\s+/g, ' ').trim(),
        company: jtCardText(card, ['[data-cy="offerTitle"] p:last-child', '[data-cy="companyName"]', '[class*="company"]']),
        location: jtCardText(card, ['[data-cy="localisationCard"]', '[class*="location"]', '[class*="localisation"]']),
        snippet: jtCardText(card, ['[data-cy="offerDescription"]', '[class*="description"]'])
      })
    })
  }

  // Generic fallback when no known layout matched: anchors that look like job
  // detail links, deduped by URL, with card text pulled from their container.
  if (out.length === 0) {
    const anchors = [...document.querySelectorAll('a[href]')].filter(a =>
      /\/(jobs?|offres?|emplois?|vacanc|position|posting)s?\b|\/viewjob|\/jobs\/view\//i.test(a.getAttribute('href') || ''))
    anchors.forEach(a => {
      const card = a.closest('li, article, div[class*="card"], div[class*="result"], div[class*="offer"]') || a
      // Never use the anchor's full textContent as the title — on card layouts the
      // whole card (company + location + snippet) is one <a>, which would glue
      // everything into the title (the reported bug). Prefer a heading / job-title
      // class, then the anchor's aria-label, then only its FIRST text line.
      let title = jtCardText(card, ['h1', 'h2', 'h3', 'h4', '[class*="job-title"]', '[class*="jobTitle"]', '[class*="job_title"]'])
      if (!title) title = (a.getAttribute('aria-label') || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
      if (!title) title = (a.textContent || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
      push({
        url: jtAbsUrl(a.getAttribute('href')),
        title,
        company: jtCardText(card, ['[class*="company"]', '[class*="employer"]', '[class*="entreprise"]', '[class*="subtitle"]']),
        location: jtCardText(card, ['[class*="location"]', '[class*="localisation"]', '[class*="lieu"]', '[class*="region"]']),
        snippet: jtCardText(card, ['[class*="description"]'])
      })
    })
  }

  return out.slice(0, 25)
}

// LinkedIn cards give no reliable title/company across its DOM variants, so fill
// them (and the JD) from the guest API by job id — the same source used for the
// single-add. Concurrency-capped; failures keep the card's placeholder fields.
async function jtEnrichLinkedInCards(cards) {
  if (!location.hostname.replace('www.', '').includes('linkedin.com')) return cards
  const targets = cards.filter(c => jtLinkedInJobId(c.url))
  if (!targets.length) return cards
  let i = 0
  const worker = async () => {
    while (i < targets.length) {
      const c = targets[i++]
      const g = await fetchLinkedInGuest(jtLinkedInJobId(c.url)).catch(() => null)
      if (g) {
        if (g.title) c.title = g.title
        if (g.company) c.company = g.company
        if (g.location) c.location = g.location
        if (g.description) c.snippet = g.description.slice(0, 600)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker))
  return cards
}

// ── Review panel (Shadow DOM) ────────────────────────────────────────────────
let jtScanHost = null, jtScanShadow = null
let jtScanResults = []

function jtRemoveScanPanel() {
  if (jtScanHost && jtScanHost.parentNode) jtScanHost.parentNode.removeChild(jtScanHost)
  jtScanHost = null; jtScanShadow = null
}
function jtEnsureScanHost() {
  if (jtScanHost && document.contains(jtScanHost)) return
  jtScanHost = document.createElement('div')
  jtScanHost.id = 'jt-scan-host'
  jtScanHost.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483001;'
  jtScanShadow = jtScanHost.attachShadow({ mode: 'open' })
  document.body.appendChild(jtScanHost)
}

function jtVerdictLabel(v) {
  return ({ STRONG_MATCH: 'Excellent', GOOD_MATCH: 'Bon match', PARTIAL_MATCH: 'Partiel', WEAK_MATCH: 'Faible' })[v] || ''
}

// ── Facet derivation (for the scan-panel filters) ─────────────────────────────
// Card text is short (title + location + snippet), so these are best-effort
// heuristics: a card only carries a facet when the wording is unambiguous, and
// the filter chips render only for facets that actually appear in the results.

// Work mode: hybrid is checked FIRST because "télétravail" also shows up in
// hybrid phrasing ("télétravail partiel", "2 jours de télétravail"). LinkedIn
// puts a canonical "(À distance)/(Hybride)/(Sur site)" tag in `location`, which
// these patterns also catch.
function jtDetectWorkMode(text) {
  const t = (text || '').toLowerCase()
  if (!t) return ''
  if (/\bhybrid[e]?\b|t[ée]l[ée]travail\s+partiel|partial(?:ly)?\s+remote|remote\s+partiel|[1-4]\s*(?:j|jours?)\s*(?:\/|par|de|of)?\s*(?:t[ée]l[ée]travail|semaine|remote|week)/.test(t)) return 'hybrid'
  if (/\bfull[\s-]?remote\b|100\s*%\s*(?:t[ée]l[ée]travail|remote|[àa]\s+distance)|fully\s+remote|\bremote\b|t[ée]l[ée]travail|[àa]\s+distance|work\s+from\s+home|\bwfh\b/.test(t)) return 'remote'
  if (/\bon[\s-]?site\b|sur\s+site|pr[ée]sentiel|on\s+premises?|no\s+remote|pas\s+de\s+t[ée]l[ée]travail/.test(t)) return 'onsite'
  return ''
}

// Contract type — most specific first (alternance/stage before CDD/CDI).
function jtDetectContract(text) {
  const t = (text || '').toLowerCase()
  if (!t) return ''
  if (/\bfreelance\b|\bfreelanc|ind[ée]pendant|contractor|\bfreel\b/.test(t)) return 'Freelance'
  if (/\balternan(?:ce|t)\b|apprentissage|apprenti\b|work[\s-]?study/.test(t)) return 'Alternance'
  if (/\bstage\b|stagiaire|\binternship\b|\bintern\b/.test(t)) return 'Stage'
  if (/\bcdd\b|dur[ée]e\s+d[ée]termin[ée]e|fixed[\s-]?term|\btemporary\b|int[ée]rim/.test(t)) return 'CDD'
  if (/\bcdi\b|dur[ée]e\s+ind[ée]termin[ée]e|\bpermanent\b/.test(t)) return 'CDI'
  return ''
}

// Parse an approximate annual minimum salary (in euros) from free text. Every
// match must be currency-anchored (€/$/£/EUR…) or a plausible "k" figure so we
// don't pick up years or head-counts. Monthly figures are annualised (×12).
// Returns a number or null.
function jtParseSalary(text) {
  if (!text) return null
  const t = text.replace(/[\u00a0\u202f\u2007\u2009]/g, ' ') // normalize (narrow) non-breaking spaces used in "45 000 EUR"
  const monthly = /(?:par|\/)\s*mois|\bmensuel|per\s+month|\/mo\b|\bmonthly\b/i.test(t)
  const nums = []
  const cur = '€|eur|euros?|\\$|usd|£|gbp'
  const accept = (v) => {
    if (monthly && v >= 1000 && v <= 40000) nums.push(v * 12)
    else if (v >= 10000 && v <= 500000) nums.push(v)
  }
  // "45k", "45 k€", "€45K" — bare k accepted in a plausible 15–400 range.
  const reK = new RegExp(`(?:(${cur})\\s*)?(\\d{2,3})(?:[.,]\\d)?\\s*[kK]\\s*(${cur})?`, 'gi')
  let m
  while ((m = reK.exec(t))) {
    const n = parseInt(m[2], 10)
    if (m[1] || m[3]) accept(n * 1000)
    else if (n >= 15 && n <= 400) nums.push(n * 1000)
  }
  // "45 000 €", "€45,000", "45000 EUR" — thousands-grouped or 5–6 bare digits,
  // but only when a currency sits next to it.
  const reFull = new RegExp(`(?:(${cur})\\s*)?(\\d{1,3}(?:[ .,]\\d{3})+|\\d{5,6})\\s*(${cur})?`, 'gi')
  while ((m = reFull.exec(t))) {
    if (!(m[1] || m[3])) continue
    accept(parseInt(m[2].replace(/[ .,]/g, ''), 10))
  }
  return nums.length ? Math.min(...nums) : null
}

// Derive all filterable facets for one card in a single pass.
function jtCardFacets(card) {
  const text = [card.title, card.location, card.snippet].filter(Boolean).join('  ')
  return {
    workMode: jtDetectWorkMode(text),
    contract: jtDetectContract(text),
    salaryMin: jtParseSalary(text)
  }
}

function jtModeLabel(mode) {
  return ({ remote: '🏠 Remote', hybrid: '🔀 Hybride', onsite: '🏢 Sur site' })[mode] || ''
}
function jtFmtSalary(v) {
  return v >= 1000 ? Math.round(v / 1000) + 'k€' : v + '€'
}

const JT_SCAN_STYLE = `
  :host, * { box-sizing: border-box; }
  .jt-sc { width: 380px; max-width: calc(100vw - 40px); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 14px 40px rgba(15,23,42,0.24); overflow: hidden; }
  .jt-sc-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #4f46e5; color: #fff; }
  .jt-sc-head b { font-size: 14px; font-weight: 700; flex: 1; }
  .jt-sc-x { background: none; border: none; color: rgba(255,255,255,.85); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px; }
  .jt-sc-x:hover { color: #fff; }
  .jt-sc-sub { font-size: 11px; color: #64748b; padding: 8px 14px 4px; }
  .jt-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 12px 8px; border-bottom: 1px solid #f1f5f9; }
  .jt-chip { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 11px; font-weight: 600;
    color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 999px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
  .jt-chip:hover { background: #e2e8f0; }
  .jt-chip.on { color: #fff; background: #4f46e5; border-color: #4f46e5; }
  .jt-sel { font: inherit; font-size: 11px; font-weight: 600; color: #475569; background: #f1f5f9;
    border: 1px solid #e2e8f0; border-radius: 999px; padding: 4px 8px; cursor: pointer; }
  .jt-sel:focus { outline: none; border-color: #4f46e5; }
  .jt-fsep { width: 1px; align-self: stretch; background: #e2e8f0; margin: 2px 2px; }
  .jt-reset { font: inherit; font-size: 11px; color: #6366f1; background: none; border: none; cursor: pointer; padding: 4px 4px; margin-left: auto; }
  .jt-reset:hover { text-decoration: underline; }
  .jt-empty { padding: 14px 16px; font-size: 12px; color: #94a3b8; text-align: center; }
  .jt-sc-list { max-height: 52vh; overflow-y: auto; padding: 4px 6px 6px; }
  .jt-row { display: flex; gap: 9px; padding: 9px 8px; border-radius: 9px; align-items: flex-start; }
  .jt-row:hover { background: #f8fafc; }
  .jt-row.applied { opacity: .6; }
  .jt-row input[type=checkbox] { margin-top: 3px; width: 15px; height: 15px; flex-shrink: 0; accent-color: #4f46e5; cursor: pointer; }
  .jt-b { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; color: #fff; font-weight: 700; font-size: 13px; flex-shrink: 0; }
  .jt-info { min-width: 0; flex: 1; line-height: 1.3; }
  .jt-t { font-size: 12.5px; font-weight: 600; color: #0f172a; }
  .jt-m { font-size: 11px; color: #64748b; margin-top: 1px; }
  .jt-r { font-size: 11px; color: #475569; margin-top: 3px; font-style: italic; }
  .jt-tag { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: #059669; border: 1px solid #6ee7b7; background: #ecfdf5; border-radius: 6px; padding: 1px 5px; margin-top: 3px; }
  .jt-foot { display: flex; gap: 8px; align-items: center; padding: 11px 14px; border-top: 1px solid #f1f5f9; }
  .jt-count { font-size: 11px; color: #64748b; flex: 1; }
  .jt-add-sel { border: none; background: #4f46e5; color: #fff; font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 14px; border-radius: 9px; cursor: pointer; }
  .jt-add-sel:disabled { opacity: .5; cursor: default; }
  .jt-note { padding: 18px 16px; font-size: 12.5px; color: #475569; line-height: 1.5; text-align: center; }
  .jt-spin { width: 22px; height: 22px; border: 2px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: jt-rot .8s linear infinite; margin: 0 auto 10px; }
  @keyframes jt-rot { to { transform: rotate(360deg); } }
`

function jtRenderScanPanel(state) {
  jtEnsureScanHost()
  const head = (body) => `<style>${JT_SCAN_STYLE}</style><div class="jt-sc">
    <div class="jt-sc-head"><b>🔎 Offres qui me correspondent</b><button class="jt-sc-x" id="jt-sc-x" aria-label="Fermer">✕</button></div>
    ${body}</div>`

  if (state.loading) {
    jtSetHTML(jtScanShadow, head(`<div class="jt-note"><div class="jt-spin"></div>Analyse de ${state.total || ''} offres avec votre CV…</div>`))
    jtScanShadow.getElementById('jt-sc-x').addEventListener('click', jtRemoveScanPanel)
    return
  }
  if (state.noCv) {
    jtSetHTML(jtScanShadow, head(`<div class="jt-note">Aucun CV synchronisé. Ouvrez le popup JobTrackr puis <b>🔄 Sync CV + Profil</b> avant de scanner.</div>`))
    jtScanShadow.getElementById('jt-sc-x').addEventListener('click', jtRemoveScanPanel)
    return
  }
  if (state.error) {
    jtSetHTML(jtScanShadow, head(`<div class="jt-note">Erreur pendant l'analyse : ${escHtml(state.error).slice(0, 120)}</div>`))
    jtScanShadow.getElementById('jt-sc-x').addEventListener('click', jtRemoveScanPanel)
    return
  }

  const results = (state.results || [])
    .map((r, idx) => ({ ...r, _idx: idx }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  // Derive filterable facets once per card; attach to the result so both the row
  // markup and the filter bar can read them.
  results.forEach(r => { r._facets = jtCardFacets(r) })

  const rows = results.map(r => {
    const score = typeof r.score === 'number' ? r.score : null
    const color = score != null ? jtScoreColor(score) : '#94a3b8'
    const pre = !r.applied && score != null && score >= 65
    const f = r._facets
    const facetBits = [
      f.workMode ? jtModeLabel(f.workMode) : '',
      f.contract || '',
      f.salaryMin ? '💰 ' + jtFmtSalary(f.salaryMin) : ''
    ].filter(Boolean).map(escHtml)
    const meta = [escHtml(r.company || ''), escHtml(r.location || ''), ...facetBits].filter(Boolean).join(' · ')
    const vlabel = jtVerdictLabel(r.verdict)
    return `<label class="jt-row${r.applied ? ' applied' : ''}" data-mode="${f.workMode}" data-contract="${f.contract}" data-salary="${f.salaryMin ?? ''}" data-score="${score ?? ''}">
      ${r.applied
        ? '<input type="checkbox" disabled />'
        : `<input type="checkbox" data-idx="${r._idx}" ${pre ? 'checked' : ''} />`}
      <span class="jt-b" style="background:${color}">${score != null ? score : '–'}</span>
      <span class="jt-info">
        <span class="jt-t">${escHtml(r.title || '')}</span>
        ${meta ? `<span class="jt-m">${meta}</span>` : ''}
        ${r.reason ? `<span class="jt-r">${escHtml(r.reason)}${vlabel ? ' · ' + vlabel : ''}</span>` : (vlabel ? `<span class="jt-r">${vlabel}</span>` : '')}
        ${r.applied ? '<span class="jt-tag">déjà suivi</span>' : ''}
      </span>
    </label>`
  }).join('')

  // Build the filter bar — only render a chip/control for facets that actually
  // appear in the results, so there are no dead filters. Min-score chips always
  // apply since every card is scored.
  const present = {
    modes: [...new Set(results.map(r => r._facets.workMode).filter(Boolean))],
    contracts: [...new Set(results.map(r => r._facets.contract).filter(Boolean))],
    maxSalary: Math.max(0, ...results.map(r => r._facets.salaryMin || 0))
  }
  const modeChips = ['remote', 'hybrid', 'onsite']
    .filter(m => present.modes.includes(m))
    .map(m => `<button class="jt-chip" data-f="mode" data-v="${m}">${jtModeLabel(m)}</button>`).join('')
  const contractChips = ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance']
    .filter(c => present.contracts.includes(c))
    .map(c => `<button class="jt-chip" data-f="contract" data-v="${c}">${c}</button>`).join('')
  const salThresholds = [30000, 40000, 50000, 60000, 80000].filter(v => v <= present.maxSalary)
  const salSelect = present.maxSalary > 0
    ? `<select class="jt-sel" id="jt-sal" title="Filtrer par salaire">
         <option value="">💰 Salaire</option>
         <option value="any">Affiché</option>
         ${salThresholds.map(v => `<option value="${v}">≥ ${jtFmtSalary(v)}</option>`).join('')}
       </select>`
    : ''
  const scoreChips = ['65', '80']
    .map(s => `<button class="jt-chip" data-f="score" data-v="${s}">★ ${s}+</button>`).join('')
  const filterParts = [modeChips, contractChips, salSelect].filter(Boolean)
  const filterBar = (present.modes.length || present.contracts.length || present.maxSalary > 0 || results.length > 1)
    ? `<div class="jt-filters" id="jt-filters">
        ${filterParts.join('<span class="jt-fsep"></span>')}
        ${filterParts.length ? '<span class="jt-fsep"></span>' : ''}${scoreChips}
        <button class="jt-reset" id="jt-reset" style="display:none">Réinitialiser</button>
      </div>`
    : ''

  const trackable = results.filter(r => !r.applied).length
  const baseSub = `${results.length} offre(s) analysée(s)${trackable < results.length ? ` · ${results.length - trackable} déjà suivie(s)` : ''}`
  jtSetHTML(jtScanShadow, head(`
    <div class="jt-sc-sub" id="jt-sc-sub">${baseSub}</div>
    ${filterBar}
    <div class="jt-sc-list">${rows || '<div class="jt-note">Aucune offre lisible sur cette page.</div>'}<div class="jt-empty" id="jt-empty" style="display:none">Aucune offre ne correspond aux filtres.</div></div>
    <div class="jt-foot">
      <span class="jt-count" id="jt-sc-count"></span>
      <button class="jt-add-sel" id="jt-sc-add">＋ Ajouter la sélection</button>
    </div>`))

  jtScanShadow.getElementById('jt-sc-x').addEventListener('click', jtRemoveScanPanel)
  const addBtn = jtScanShadow.getElementById('jt-sc-add')
  const countEl = jtScanShadow.getElementById('jt-sc-count')
  const subEl = jtScanShadow.getElementById('jt-sc-sub')
  const emptyEl = jtScanShadow.getElementById('jt-empty')
  const rowEls = [...jtScanShadow.querySelectorAll('.jt-row')]
  const boxes = () => [...jtScanShadow.querySelectorAll('input[type=checkbox][data-idx]')]
  const isVisible = (el) => el && el.style.display !== 'none'
  const refresh = () => {
    const n = boxes().filter(b => b.checked && isVisible(b.closest('.jt-row'))).length
    countEl.textContent = n ? `${n} sélectionnée(s)` : 'Rien de sélectionné'
    addBtn.disabled = n === 0
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  const chips = [...jtScanShadow.querySelectorAll('.jt-chip')]
  const salSel = jtScanShadow.getElementById('jt-sal')
  const resetBtn = jtScanShadow.getElementById('jt-reset')
  const applyFilters = () => {
    const modes = new Set(chips.filter(c => c.dataset.f === 'mode' && c.classList.contains('on')).map(c => c.dataset.v))
    const contracts = new Set(chips.filter(c => c.dataset.f === 'contract' && c.classList.contains('on')).map(c => c.dataset.v))
    const scoreChip = chips.find(c => c.dataset.f === 'score' && c.classList.contains('on'))
    const minScore = scoreChip ? Number(scoreChip.dataset.v) : 0
    const salVal = salSel ? salSel.value : ''
    let visible = 0
    rowEls.forEach(row => {
      const s = row.dataset.salary === '' ? null : Number(row.dataset.salary)
      const sc = row.dataset.score === '' ? null : Number(row.dataset.score)
      let ok = true
      if (modes.size && !modes.has(row.dataset.mode)) ok = false
      if (ok && contracts.size && !contracts.has(row.dataset.contract)) ok = false
      if (ok && salVal === 'any' && s == null) ok = false
      if (ok && salVal && salVal !== 'any' && (s == null || s < Number(salVal))) ok = false
      if (ok && minScore && (sc == null || sc < minScore)) ok = false
      row.style.display = ok ? '' : 'none'
      if (ok) visible++
    })
    const anyActive = modes.size || contracts.size || minScore || (salVal !== '')
    if (resetBtn) resetBtn.style.display = anyActive ? '' : 'none'
    if (emptyEl) emptyEl.style.display = visible === 0 ? 'block' : 'none'
    subEl.textContent = anyActive ? `${visible} affichée(s) sur ${results.length}` : baseSub
    refresh()
  }
  chips.forEach(c => c.addEventListener('click', () => {
    if (c.dataset.f === 'score') {
      const was = c.classList.contains('on')
      chips.filter(x => x.dataset.f === 'score').forEach(x => x.classList.remove('on'))
      if (!was) c.classList.add('on')
    } else {
      c.classList.toggle('on')
    }
    applyFilters()
  }))
  salSel?.addEventListener('change', applyFilters)
  resetBtn?.addEventListener('click', () => {
    chips.forEach(c => c.classList.remove('on'))
    if (salSel) salSel.value = ''
    applyFilters()
  })

  boxes().forEach(b => b.addEventListener('change', refresh))
  refresh()

  addBtn.addEventListener('click', async () => {
    const chosen = boxes().filter(b => b.checked && isVisible(b.closest('.jt-row'))).map(b => results.find(r => r._idx === Number(b.dataset.idx))).filter(Boolean)
    if (!chosen.length) return
    addBtn.disabled = true
    addBtn.textContent = '⏳ Ajout…'
    try {
      // Enrich LinkedIn selections with the real JD (guest API, user session) so the
      // stored job carries a full description — the card only has title/company.
      const jobs = await Promise.all(chosen.map(async r => {
        let description = r.snippet || ''
        const id = /linkedin\.com/.test(r.url || '') ? jtLinkedInJobId(r.url) : ''
        if (id) { const g = await fetchLinkedInGuest(id); if (g && g.description) description = g.description }
        return { company: r.company, position: r.title, url: r.url, snippet: description }
      }))
      const res = await browser.runtime.sendMessage({ type: 'ADD_JOB_BATCH', jobs })
      if (res && res.ok) {
        addBtn.textContent = `✓ ${res.count} ajoutée(s)`
        setTimeout(jtRemoveScanPanel, 1400)
      } else {
        addBtn.textContent = '❌ Erreur'; addBtn.disabled = false
      }
    } catch {
      addBtn.textContent = '❌ Erreur'; addBtn.disabled = false
    }
  })
}

async function runListingScan(cards) {
  jtScanResults = []
  jtRenderScanPanel({ loading: true, total: cards.length })
  try {
    // LinkedIn: replace the unreliable card fields with clean title/company/JD
    // from the guest API before scoring, so the score and panel are accurate.
    cards = await jtEnrichLinkedInCards(cards)
    const res = await browser.runtime.sendMessage({ type: 'SCAN_SCORE', cards })
    if (res && res.noCv) { jtRenderScanPanel({ noCv: true }); return }
    jtScanResults = (res && res.results) || []
    jtRenderScanPanel({ results: jtScanResults })
  } catch (e) {
    jtRenderScanPanel({ error: e.message || 'échec' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 : Boot
// ─────────────────────────────────────────────────────────────────────────────

// Attendre que le DOM soit stable avant de scanner les champs
// Expose flag on window so page console can verify script is loaded
window.__jtLoaded = true

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutofill)
} else {
  setTimeout(initAutofill, 800)
}

jtBootScorePill()

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  autofillObserver?.disconnect()
  clearTimeout(scanTimer)
  if (activePopover && document.contains(activePopover)) {
    activePopover.remove()
  }
  activePopover = null
  fieldState.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 : Auto-detect apply button clicks → confirm + add to JobTrackr
// (Removed — the automatic "Ajouter à JobTrackr ?" modal is no longer shown.
//  Jobs are added manually via the popup "Ajouter à JobTrackr" button.)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 : Extension detection ping/pong
// JobTrackr web app sends 'jobtrackr-ext-ping', we respond with 'jobtrackr-ext-pong'
// ─────────────────────────────────────────────────────────────────────────────
// Advertise the installed version so the web app can offer updates. Older builds
// only set the attribute to 'true'; here we expose the real version instead so
// SmartJobTracker can compare it against the latest release. Falls back to 'true'
// if the manifest can't be read for any reason.
let JOBTRACKR_EXT_VERSION = 'true'
try { JOBTRACKR_EXT_VERSION = browser.runtime.getManifest().version || 'true' } catch (e) {}

window.addEventListener('jobtrackr-ext-ping', () => {
  window.dispatchEvent(new CustomEvent('jobtrackr-ext-pong', { detail: JOBTRACKR_EXT_VERSION }))
})
// Also set the attribute immediately for faster detection (value = version).
document.documentElement.setAttribute('data-jobtrackr-ext', JOBTRACKR_EXT_VERSION)
