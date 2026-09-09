// Segment analytics — slice the funnel by a chosen dimension so a leak becomes
// legible per company sector, per platform, per location or per salary band. All
// pure/side-effect free (unit-testable, no network, works offline) and built on
// the SAME metric primitives as the headline funnel (utils/metrics), so a rate
// here means exactly what it means there.
//
// Denominator note: this operates PER APPLICATION (every job that left `todo`),
// not per company like the headline funnel. Sector is a company attribute, but
// platform / location / salary are per-application, so per-application is the
// honest base for a cross-cut. The panel labels itself "per application".

import {
  sentJobs, hasResponse, maxStageReached, rejectionInfo,
} from './metrics'
import { detectPlatform } from '../services/jobPlatform'
import { annualBase, toNumber } from './compensation'

// ── Sector inference ───────────────────────────────────────────────────────────
// Sectors aren't stored on a job, so we infer one from the free text we DO have
// (company name, role title, job description, notes). Deterministic keyword map,
// bilingual FR/EN. Order matters: specific sectors first, the broad "software"
// bucket last, so a fintech SaaS lands in `fintech`, not `software`. On a tie
// (equal keyword hits) the earlier sector in this list wins.
const SECTOR_KEYWORDS = [
  ['fintech', ['fintech', 'finance', 'financial', 'financier', 'financière', 'bank', 'banque', 'banking', 'bancaire', 'paiement', 'payment', 'payments', 'assurance', 'insurance', 'insurtech', 'credit', 'crédit', 'lending', 'trading', 'bourse', 'wealth', 'asset management', 'neobank', 'néobanque', 'blockchain', 'crypto']],
  ['healthtech', ['health', 'santé', 'medical', 'médical', 'médicale', 'healthcare', 'hospital', 'hôpital', 'clinic', 'clinique', 'pharma', 'pharmaceutique', 'biotech', 'medtech', 'patient', 'télémédecine', 'telemedicine', 'wellbeing', 'mental health', 'diagnostic']],
  ['ecommerce', ['ecommerce', 'commerce', 'retail', 'boutique', 'marketplace', 'fashion', 'mode', 'luxury', 'luxe', 'cosmetic', 'cosmétique', 'beauty', 'grande distribution', 'd2c', 'dtc']],
  ['consulting', ['consulting', 'conseil', 'consultant', 'advisory', 'cabinet', 'esn', 'ssii', 'accenture', 'capgemini', 'deloitte', 'mckinsey', 'sopra', 'wavestone']],
  ['edtech', ['education', 'éducation', 'edtech', 'school', 'école', 'university', 'université', 'formation', 'learning', 'elearning', 'student', 'étudiant', 'teaching', 'enseignement', 'academy', 'académie']],
  ['media', ['media', 'média', 'marketing', 'advertising', 'publicité', 'adtech', 'agence', 'agency', 'communication', 'content', 'contenu', 'presse', 'journalisme', 'brand', 'broadcast', 'audiovisuel']],
  ['gaming', ['gaming', 'video game', 'jeu vidéo', 'jeux vidéo', 'esport', 'entertainment', 'divertissement', 'streaming', 'ubisoft']],
  ['industry', ['industrie', 'industrial', 'industriel', 'manufacturing', 'usine', 'factory', 'automotive', 'automobile', 'aéronautique', 'aerospace', 'aviation', 'defense', 'défense', 'mechanical', 'mécanique', 'production', 'chemical', 'chimie']],
  ['energy', ['energy', 'énergie', 'cleantech', 'greentech', 'renewable', 'renouvelable', 'solar', 'solaire', 'eolien', 'éolien', 'electric', 'électrique', 'carbon', 'carbone', 'climate', 'climat', 'environnement', 'sustainability', 'durable', 'utility', 'hydrogen', 'hydrogène']],
  ['mobility', ['mobility', 'mobilité', 'transport', 'logistics', 'logistique', 'supply chain', 'delivery', 'livraison', 'fleet', 'railway', 'ferroviaire', 'shipping', 'freight', 'ride']],
  ['proptech', ['real estate', 'immobilier', 'proptech', 'construction', 'btp', 'property', 'logement']],
  ['telecom', ['telecom', 'télécom', 'telecommunications', 'télécommunications', 'operator', 'opérateur', 'fiber', 'fibre', 'network operator']],
  ['food', ['foodtech', 'alimentaire', 'restaurant', 'restauration', 'agriculture', 'agtech', 'agrifood', 'agroalimentaire', 'farming', 'catering', 'beverage', 'boisson']],
  ['travel', ['travel', 'voyage', 'tourism', 'tourisme', 'hospitality', 'hôtellerie', 'hotel', 'hôtel', 'airline', 'booking', 'aérien']],
  ['hr', ['recruiting', 'recruitment', 'recrutement', 'staffing', 'human resources', 'ressources humaines', 'hrtech', 'talent acquisition', 'jobboard']],
  ['publicsector', ['gouvernement', 'government', 'ministère', 'ministry', 'mairie', 'collectivité', 'administration publique', 'nonprofit', 'association', 'ong', 'ngo', 'humanitaire', 'humanitarian', 'service public']],
  ['security', ['cybersecurity', 'cybersécurité', 'cyber', 'infosec', 'sécurité informatique']],
  ['legal', ['legaltech', 'juridique', 'avocat', 'notaire', 'compliance', 'conformité']],
  // Broad catch-all — kept LAST so a specific sector always wins on a tie.
  ['software', ['saas', 'software', 'logiciel', 'developer platform', 'api', 'cloud', 'devops', 'data platform', 'infrastructure', 'open source', 'plateforme saas']],
]

export const SECTOR_IDS = [...SECTOR_KEYWORDS.map(([id]) => id), 'other']

// Whole-word/phrase scan text: lowercase, then collapse every run of non-letter/
// non-digit (accents kept) into a single space, and pad with spaces so a keyword
// match is anchored on word boundaries — avoids "care" matching "career".
function scanText(job) {
  const raw = [job?.company, job?.position, job?.title, job?.role, job?.jobDescription, job?.description, job?.notes]
    .filter(Boolean).join(' ').toLowerCase()
  return ' ' + raw.replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '
}

// Infer a sector id from a job's text. Scores each sector by how many distinct
// keywords it matches; the top score wins (earliest sector breaks a tie). No
// match at all → 'other'.
export function inferSector(job) {
  const text = scanText(job)
  if (text.trim() === '') return 'other'
  let bestId = 'other'
  let bestScore = 0
  for (const [id, keywords] of SECTOR_KEYWORDS) {
    let score = 0
    for (const kw of keywords) {
      if (text.includes(' ' + kw + ' ')) score++
    }
    if (score > bestScore) { bestScore = score; bestId = id }
  }
  return bestScore > 0 ? bestId : 'other'
}

// ── Location bucketing ──────────────────────────────────────────────────────────
const REMOTE_RE = /\b(remote|télétravail|teletravail|full[-\s]?remote|100\s?%|anywhere|distanciel|work from home|wfh)\b/i

// { key, label } — key groups, label displays. Remote and unknown are keyed to
// translatable ids; a real place keeps its (first) city segment as the label.
export function locationBucket(job) {
  const loc = (job?.location || job?.compensation?.location || '').trim()
  if (!loc) {
    if (toNumber(job?.compensation?.remotePct) === 100) return { key: 'remote', label: null }
    return { key: '__unknown__', label: null }
  }
  if (REMOTE_RE.test(loc)) return { key: 'remote', label: null }
  const city = loc.split(/[,/•|]|\s-\s/)[0].trim()
  if (!city) return { key: '__unknown__', label: null }
  return { key: 'city:' + city.toLowerCase(), label: city }
}

// ── Salary bands ────────────────────────────────────────────────────────────────
// Bands are annual, in the amount's own currency (no FX). Thresholds chosen for a
// mid/senior EU market; "unknown" collects every application with no salary signal.
export const SALARY_BANDS = [
  { key: 'lt40', max: 40000 },
  { key: '40-60', max: 60000 },
  { key: '60-80', max: 80000 },
  { key: '80-100', max: 100000 },
  { key: '100plus', max: Infinity },
]

// Best available annual salary figure: the compensation base (annualized) first,
// else the midpoint of salaryMin/salaryMax. A bare value under 1000 is read as
// "k" (e.g. "45" = 45 000), since some sources store salaries in thousands.
function jobAnnualSalary(job) {
  const base = annualBase(job?.compensation)
  if (base !== null && base > 0) return base
  const lo = toNumber(job?.salaryMin)
  const hi = toNumber(job?.salaryMax)
  let v = null
  if (lo !== null && hi !== null) v = (lo + hi) / 2
  else if (lo !== null) v = lo
  else if (hi !== null) v = hi
  if (v === null || v <= 0) return null
  if (v < 1000) v *= 1000
  return v
}

export function salaryBand(job) {
  const v = jobAnnualSalary(job)
  if (v === null) return '__unknown__'
  return (SALARY_BANDS.find(b => v < b.max) || SALARY_BANDS[SALARY_BANDS.length - 1]).key
}

// ── Dimension → per-job segment key ─────────────────────────────────────────────
export const SEGMENT_DIMENSIONS = ['sector', 'platform', 'location', 'salary']

// Returns { key, label, emoji } for a job under a dimension. `label` is a
// ready-to-show string only when it's dynamic (a platform name, a city);
// otherwise null and the UI translates by key. `emoji` decorates platforms.
function segmentOf(job, dimension) {
  switch (dimension) {
    case 'platform': {
      const p = detectPlatform(job)
      return { key: p.id, label: p.label, emoji: p.emoji }
    }
    case 'location':
      return { ...locationBucket(job), emoji: null }
    case 'salary':
      return { key: salaryBand(job), label: null, emoji: null }
    case 'sector':
    default:
      return { key: inferSector(job), label: null, emoji: null }
  }
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

// Aggregate applied jobs into segments for a dimension. Each row carries the same
// funnel rates as the headline, computed within the segment, plus the rejection
// cross-cut (rate, ATS vs human). Sorted by application count desc; the catch-all
// buckets ('other' sector, unknown location/salary) always sink to the bottom.
export function computeSegments(jobs, dimension = 'sector') {
  const applied = sentJobs(jobs)
  const groups = new Map() // key -> { key, label, emoji, jobs: [] }
  for (const job of applied) {
    const { key, label, emoji } = segmentOf(job, dimension)
    if (!groups.has(key)) groups.set(key, { key, label, emoji, jobs: [] })
    groups.get(key).jobs.push(job)
  }

  const rows = [...groups.values()].map(g => {
    const count = g.jobs.length
    const responded = g.jobs.filter(hasResponse).length
    const reachedInterview = g.jobs.filter(j => maxStageReached(j) >= 3).length
    const offers = g.jobs.filter(j => maxStageReached(j) >= 4).length
    let rejected = 0, ats = 0, human = 0
    for (const j of g.jobs) {
      const info = rejectionInfo(j)
      if (info.rejected) { rejected++; if (info.ats) ats++; else human++ }
    }
    return {
      key: g.key,
      label: g.label,
      emoji: g.emoji,
      count,
      responded,
      responseRate: pct(responded, count),
      reachedInterview,
      interviewRate: pct(reachedInterview, count),
      offers,
      offerRate: pct(offers, count),
      rejected,
      rejectionRate: pct(rejected, count),
      ats,
      human,
    }
  })

  const isCatchAll = (k) => k === 'other' || k === '__unknown__'
  rows.sort((a, b) => {
    const ca = isCatchAll(a.key), cb = isCatchAll(b.key)
    if (ca !== cb) return ca ? 1 : -1
    return b.count - a.count
  })
  return { total: applied.length, dimension, segments: rows }
}
