/**
 * Stage 1 — Rule-based email parser
 * Extracts company, position, status from emails using deterministic patterns.
 * No Claude call needed when confidence is high.
 */

// ─── ATS domains → always "reviewing" or "rejected" ──────────────────────────
const ATS_DOMAINS = new Set([
  'ashbyhq.com','greenhouse.io','lever.co','workable.com','teamtailor.com',
  'recruitee.com','bamboohr.com','smartrecruiters.com','jobvite.com',
  'icims.com','myworkdayjobs.com','taleo.net','breezy.hr','dover.com',
  'pinpoint.com','comeet.com','jazz.co','rippling.com',
])

// ─── Rejection keywords ───────────────────────────────────────────────────────
const REJECTION_KW = [
  'not be moving forward','not moving forward','not selected','we regret',
  'nous avons le regret','no longer being considered','decided to move forward with other',
  'not an ideal fit','filled the position','nous ne donnons pas suite',
  'nous n\'avons pas retenu','sans suite','ne correspond pas',
]

// ─── Interview keywords ───────────────────────────────────────────────────────
const INTERVIEW_KW = [
  'interview','entretien','rendez-vous','meeting','call','visio','zoom',
  'teams','google meet','schedule','planifier','convocation',
]

// ─── Reviewing keywords ───────────────────────────────────────────────────────
const REVIEWING_KW = [
  'received your application','application received','bien reçu','avons bien reçu',
  'under review','en cours d\'examen','candidature reçue','thank you for applying',
  'thanks for applying','thanks for your application','thank you for your application',
  'application viewed','was viewed','viewed your application','a été consultée',
]

function emailDomain(from = '') {
  const match = from.match(/@([\w.-]+)/)
  return match ? match[1].toLowerCase() : ''
}

// ─── Company extraction patterns ─────────────────────────────────────────────
function extractCompany(email) {
  const subject = email.subject || ''
  const body    = (email.body || '') + ' ' + (email.snippet || '')
  const from    = email.from || ''

  // 1. "CompanyName - France" / "CompanyName · France" / "CompanyName, France"
  const countryPattern = /([A-Z][^\n·•–—]{2,40}?)\s*[-·,]\s*(?:France|Germany|UK|Belgium|Switzerland|Canada|USA|Spain|Italy|Netherlands)\b/
  const countryMatch = body.match(countryPattern) || subject.match(countryPattern)
  if (countryMatch) return countryMatch[1].trim()

  // 2. "Your application was viewed by X" / "Application to X" / "at X"
  const patterns = [
    /(?:viewed by|application (?:to|at|for)|applying (?:to|at)|candidature (?:chez|pour|à))\s+([A-Z][^\n.!?,]{1,40}?)(?:\s*[-–]|\s*\n|$)/i,
    /(?:joining|rejoindre|join)\s+([A-Z][^\n.!?,]{1,40}?)(?:\s*[-–]|\s*\n|\s+team|$)/i,
    /(?:team at|équipe de|hiring team at)\s+([A-Z][^\n.!?,]{1,40}?)(?:\s*[-–]|\s*[.!?\n]|$)/i,
  ]
  for (const p of patterns) {
    const m = body.match(p) || subject.match(p)
    if (m) return m[1].trim()
  }

  // 3. Subject: "Application – Position @ Company" or "Candidature : Position chez Company"
  const subjectPattern = /(?:@|chez|at|–|-)\s*([A-Z][^\n.!?@]{2,40})(?:\s*[-–.]|\s*$)/
  const subjectMatch = subject.match(subjectPattern)
  if (subjectMatch) return subjectMatch[1].trim()

  // 4. ATS sender domain root → fallback company hint (low confidence)
  const domain = emailDomain(from)
  if (domain && !['gmail','yahoo','outlook','hotmail','linkedin','indeed'].some(d => domain.includes(d))) {
    // e.g. noreply@jobgether.com → "Jobgether"
    const domainRoot = domain.split('.')[0]
    if (domainRoot.length > 2) return domainRoot.charAt(0).toUpperCase() + domainRoot.slice(1)
  }

  return null
}

// ─── Position extraction ──────────────────────────────────────────────────────
function extractPosition(email) {
  const subject = email.subject || ''
  const body    = (email.body || '').slice(0, 800)

  // "Product Manager - Full Remote" in subject
  const subjectTitle = subject.match(/^(?:Application[:\s–-]+|Candidature[:\s–-]+|Re:\s+)?(.{5,80})(?:\s*[-–@]|\s+at\s|\s+chez\s)/i)
  if (subjectTitle) {
    const candidate = subjectTitle[1].trim()
    // Reject if it looks like a company name intro ("Your application was viewed by...")
    if (!/^(your|votre|we |nous |thank|merci)/i.test(candidate)) return candidate
  }

  // "role of X" / "poste de X" / "position of X"
  const roleMatch = body.match(/(?:role of|poste de|position of|pour le poste de|for the (?:role|position) of)\s+([^.!?\n]{5,60})/i)
  if (roleMatch) return roleMatch[1].trim()

  return null
}

// ─── Status determination ─────────────────────────────────────────────────────
function determineStatus(email) {
  const subject = email.subject || ''
  const body    = ((email.body || '') + ' ' + (email.snippet || '')).toLowerCase()
  const from    = email.from || ''
  const domain  = emailDomain(from)

  if (email.fromMe) return 'sent'

  const isRejection = REJECTION_KW.some(k => body.includes(k))
  if (isRejection) return ATS_DOMAINS.has(domain) ? 'rejected_ats' : 'rejected'

  const isInterview = INTERVIEW_KW.some(k => body.includes(k.toLowerCase()) || subject.toLowerCase().includes(k.toLowerCase()))
  if (isInterview) return 'interview'

  const isReviewing = REVIEWING_KW.some(k => body.includes(k.toLowerCase()))
  if (isReviewing) return 'reviewing'

  if (ATS_DOMAINS.has(domain)) return 'reviewing'

  return null // unknown → needs Claude
}

// ─── Short note generation ────────────────────────────────────────────────────
function generateNote(email, status) {
  const subject = email.subject || ''
  const snippet = (email.snippet || '').slice(0, 100)

  if (email.fromMe) return `Candidature envoyée`
  if (status === 'interview') return `Invitation entretien — ${subject.slice(0, 50)}`
  if (status === 'reviewing') return snippet || 'Candidature reçue et en cours d\'examen'
  if (status === 'rejected' || status === 'rejected_ats') return 'Candidature non retenue'
  return snippet || subject.slice(0, 60)
}

// ─── Main parse function ──────────────────────────────────────────────────────
/**
 * Parse a single email using rules only.
 * Returns null if confidence is too low (→ needs Claude).
 */
export function parseEmailByRules(email) {
  const status   = determineStatus(email)
  const company  = extractCompany(email)
  const position = extractPosition(email)

  // Need at least company + status to skip Claude
  if (!company || !status) return null

  // Parse email date
  let date = ''
  try { date = new Date(email.date).toISOString().split('T')[0] } catch {}
  if (!date) return null

  return {
    emailId:   null,
    company,
    position:  position || null,
    status,
    date,
    notes:     generateNote(email, status),
    confidence: 80,
    // metadata
    gmailId:   email.id,
    fromEmail: email.from,
    fromMe:    email.fromMe || false,
    _byRules:  true,
  }
}

/**
 * Stage 1: parse what we can by rules, return the rest for Claude.
 */
export function preParseEmails(emails) {
  const parsed   = []
  const needsAI  = []

  for (const email of emails) {
    const result = parseEmailByRules(email)
    if (result) {
      parsed.push(result)
    } else {
      needsAI.push(email)
    }
  }

  console.log(`[emailParser] Rules: ${parsed.length} parsed, ${needsAI.length} need Claude`)
  return { parsed, needsAI }
}
