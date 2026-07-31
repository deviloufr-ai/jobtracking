// Job-platform detection — derives, per candidature, WHICH platform it came
// through (LinkedIn, Jobgether, HelloWork, Welcome to the Jungle, an ATS…).
// Powers the "Platforms" tracker view. Pure functions, no mutation/sync: the
// platform is inferred on render from signals already on the job (posting URL,
// the sender domain of email-sourced history entries, or a board-named company
// for ATS-only candidatures). Anything with no recognisable platform falls into
// the "direct" bucket (applied straight to a company, or added manually).

// Each platform: id, human label, an emoji badge (used when no logo resolves),
// the domains that identify it, and the normalized company-name aliases that
// mark a board-named company (the ATS fallback where the real employer is hidden).
export const PLATFORMS = [
  { id: 'linkedin',        label: 'LinkedIn',              emoji: '💼', domains: ['linkedin.com'],                              names: ['linkedin'] },
  { id: 'indeed',          label: 'Indeed',                emoji: '🔎', domains: ['indeed.com', 'indeed.fr'],                   names: ['indeed'] },
  { id: 'wttj',            label: 'Welcome to the Jungle', emoji: '🌴', domains: ['welcometothejungle.com', 'welcomekit.co'],  names: ['welcometothejungle', 'welcomekit', 'wttj'] },
  { id: 'hellowork',       label: 'HelloWork',             emoji: '👋', domains: ['hellowork.com'],                            names: ['hellowork'] },
  { id: 'apec',            label: 'Apec',                  emoji: '📇', domains: ['apec.fr'],                                  names: ['apec'] },
  { id: 'jobgether',       label: 'Jobgether',             emoji: '🌐', domains: ['jobgether.com'],                            names: ['jobgether'] },
  { id: 'francetravail',   label: 'France Travail',        emoji: '🇫🇷', domains: ['francetravail.fr', 'pole-emploi.fr'],       names: ['francetravail', 'poleemploi'] },
  { id: 'monster',         label: 'Monster',               emoji: '👾', domains: ['monster.fr', 'monster.com'],                names: ['monster'] },
  { id: 'cadremploi',      label: 'Cadremploi',            emoji: '📈', domains: ['cadremploi.fr'],                            names: ['cadremploi'] },
  { id: 'glassdoor',       label: 'Glassdoor',             emoji: '🚪', domains: ['glassdoor.com', 'glassdoor.fr'],            names: ['glassdoor'] },
  { id: 'malt',            label: 'Malt',                  emoji: '🟠', domains: ['malt.fr', 'malt.com'],                      names: ['malt'] },
  { id: 'jobteaser',       label: 'JobTeaser',             emoji: '🎓', domains: ['jobteaser.com'],                            names: ['jobteaser'] },
  { id: 'freework',        label: 'Free-Work',             emoji: '💻', domains: ['free-work.com', 'freework.fr'],             names: ['freework'] },
  { id: 'meteojob',        label: 'Meteojob',              emoji: '🌤️', domains: ['meteojob.com'],                             names: ['meteojob'] },
  { id: 'keljob',          label: 'Keljob',                emoji: '🗞️', domains: ['keljob.com'],                               names: ['keljob'] },
  { id: 'otta',            label: 'Otta',                  emoji: '✨', domains: ['otta.com'],                                 names: ['otta'] },
  { id: 'ziprecruiter',    label: 'ZipRecruiter',          emoji: '⚡', domains: ['ziprecruiter.com'],                         names: ['ziprecruiter'] },
  { id: 'remotive',        label: 'Remotive',              emoji: '🏝️', domains: ['remotive.com', 'remotive.io'],             names: ['remotive'] },
  // ── ATS platforms (application submitted through the employer's ATS) ──────
  { id: 'greenhouse',      label: 'Greenhouse',            emoji: '🌱', domains: ['greenhouse.io'],                            names: ['greenhouse'] },
  { id: 'lever',           label: 'Lever',                 emoji: '🎚️', domains: ['lever.co'],                                 names: ['lever'] },
  { id: 'ashby',           label: 'Ashby',                 emoji: '🧩', domains: ['ashbyhq.com'],                              names: ['ashby', 'ashbyhq'] },
  { id: 'workable',        label: 'Workable',              emoji: '🗂️', domains: ['workable.com'],                             names: ['workable'] },
  { id: 'teamtailor',      label: 'Teamtailor',            emoji: '🧵', domains: ['teamtailor.com', 'teamtailor-mail.com'],   names: ['teamtailor'] },
  { id: 'recruitee',       label: 'Recruitee',             emoji: '🍃', domains: ['recruitee.com'],                            names: ['recruitee'] },
  { id: 'smartrecruiters', label: 'SmartRecruiters',       emoji: '🤝', domains: ['smartrecruiters.com'],                     names: ['smartrecruiters'] },
  { id: 'workday',         label: 'Workday',               emoji: '📅', domains: ['myworkdayjobs.com', 'workday.com'],         names: ['workday'] },
  { id: 'jobvite',         label: 'Jobvite',               emoji: '📨', domains: ['jobvite.com'],                              names: ['jobvite'] },
  { id: 'bamboohr',        label: 'BambooHR',              emoji: '🎋', domains: ['bamboohr.com'],                             names: ['bamboohr'] },
  { id: 'icims',           label: 'iCIMS',                 emoji: '🧷', domains: ['icims.com'],                                names: ['icims'] },
  { id: 'taleo',           label: 'Taleo',                 emoji: '📎', domains: ['taleo.net'],                                names: ['taleo'] },
]

// The catch-all bucket: candidatures with no detectable platform — applied
// directly to a company's own site, or added by hand.
export const PLATFORM_DIRECT = { id: 'direct', label: 'Direct / Other', emoji: '🏢', domains: [], names: [] }

const normalizeName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// hostname of a URL, minus protocol / path / leading www. Tolerates URLs with
// no protocol ("linkedin.com/jobs/…") since `new URL` would reject those.
function hostFromUrl(url) {
  if (!url || typeof url !== 'string') return ''
  let s = url.trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // strip scheme
  s = s.split(/[/?#]/)[0]                       // drop path/query/hash
  s = s.replace(/^www\./, '')
  return s
}

// domain part of an email address, tolerating "Name <user@domain.com>" forms.
function domainFromEmail(from) {
  if (!from || typeof from !== 'string') return ''
  const m = from.toLowerCase().match(/@([a-z0-9.-]+)/)
  return m ? m[1].replace(/^www\./, '') : ''
}

// host matches a platform domain when it IS the domain or a subdomain of it.
const hostMatchesDomain = (host, domain) => host === domain || host.endsWith('.' + domain)

function platformForHost(host) {
  if (!host) return null
  return PLATFORMS.find(p => p.domains.some(d => hostMatchesDomain(host, d))) || null
}

function platformForName(name) {
  const n = normalizeName(name)
  if (!n) return null
  return PLATFORMS.find(p => p.names.includes(n)) || null
}

// Detect the platform a candidature came through. Precedence, strongest signal
// first: an explicit saved posting URL → a board-named company (ATS-only
// candidature where the employer is hidden) → the sender domain of any
// email-sourced history entry → extracted position links. No match → "direct".
export function detectPlatform(job) {
  if (!job) return PLATFORM_DIRECT

  // 1. Saved posting URL (offerUrl on todo entries carries the same link).
  const byUrl = platformForHost(hostFromUrl(job.url))
  if (byUrl) return byUrl

  // 2. Board-named company (companyFromAts case: "Jobgether", "Indeed"…).
  const byCompany = platformForName(job.company)
  if (byCompany) return byCompany

  // 3. Sender domain of email-sourced history entries.
  for (const h of job.history || []) {
    const byFrom = platformForHost(domainFromEmail(h?.from))
    if (byFrom) return byFrom
    const byOffer = platformForHost(hostFromUrl(h?.offerUrl))
    if (byOffer) return byOffer
  }

  // 4. Extracted position links (ranked URLs pulled from the email body).
  for (const link of job.positionLinks || []) {
    const byLink = platformForHost(hostFromUrl(typeof link === 'string' ? link : link?.url))
    if (byLink) return byLink
  }

  return PLATFORM_DIRECT
}

// Group jobs by detected platform. Returns an array of { platform, jobs }
// sorted by candidature count (desc), with the "direct" bucket always last.
export function groupJobsByPlatform(jobs = []) {
  const buckets = new Map() // id -> { platform, jobs }
  for (const job of jobs) {
    const platform = detectPlatform(job)
    if (!buckets.has(platform.id)) buckets.set(platform.id, { platform, jobs: [] })
    buckets.get(platform.id).jobs.push(job)
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.platform.id === PLATFORM_DIRECT.id) return 1
    if (b.platform.id === PLATFORM_DIRECT.id) return -1
    return b.jobs.length - a.jobs.length
  })
}
