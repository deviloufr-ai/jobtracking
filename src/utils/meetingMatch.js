// Calendar event → candidature matching.
//
// The company-token search (calendar.js `q`, companyMatch.js) only finds invites
// that NAME the company. A meeting booked through a scheduling tool usually
// doesn't: a Calendly booking for a La Fourche interview lands on the calendar as
// "Alexandre Leblanc et Maher EL OUAER", organised from the recruiter's own
// mailbox, with only "Candidature au poste de Product Manager" in the description.
// So the job stayed on "no calendar event linked" although the invite was accepted.
//
// `matchEventToJob` tries, in order of confidence:
//   1. company — a distinctive company token in the title / location or in an
//      organizer/attendee email domain;
//   2. contact — the organizer/an attendee is a sender in the job's timeline or a
//      saved contact;
//   3. pending invite — the event looks like a booked interview, was created shortly
//      after the job's interview invitation, and exactly one such waiting
//      candidature fits (narrowed by position, then by the scheduling tool the
//      invitation mentioned). Ambiguity links nothing.
import { normalizeCompanyText, textMatchesCompany } from './companyMatch'
import { parseSender } from './parseSender'

const CLOSED = new Set(['archived', 'rejected', 'rejected_ats', 'cancelled'])

// Webmail / scheduling-tool domains say nothing about the employer.
const GENERIC_DOMAINS = new Set([
  'gmail', 'googlemail', 'google', 'outlook', 'hotmail', 'live', 'yahoo', 'icloud',
  'proton', 'protonmail', 'orange', 'free', 'sfr', 'laposte', 'wanadoo', 'calendly',
  'zoom', 'microsoft', 'teams', 'group', 'resource', 'calendar',
])

// Booking tools whose confirmations become calendar events without a company name.
const SCHEDULING_TOOLS = [
  ['calendly', /calendly/i],
  ['cal.com', /\bcal\.com\b/i],
  ['hubspot', /meetings\.hubspot|hubspot meetings/i],
  ['zcal', /zcal\.co/i],
  ['savvycal', /savvycal/i],
  ['youcanbook', /youcanbook\.me/i],
  ['doodle', /doodle\.com/i],
  ['goodtime', /goodtime\.io/i],
  ['google-booking', /calendar\.app\.google|booking page|agenda de réservation/i],
]

const HIRING_WORDS = /\b(candidature|candidat|poste|recrutement|entretien|entrevue|interview|application|applicant|position|hiring|recruit\w*)\b/i

// Invitation → booking lag we accept: the event is created (booked) within this
// many days after the interview invitation landed on the timeline.
const MAX_BOOKING_LAG_DAYS = 21
const DAY = 24 * 60 * 60 * 1000

export function schedulingTool(text = '') {
  for (const [name, re] of SCHEDULING_TOOLS) if (re.test(text)) return name
  return null
}

function eventText(event) {
  return [event.title, event.description, event.location].filter(Boolean).join(' \n ')
}

// A Calendly location is "https://calendly.com/events/<id>/microsoft_teams" —
// its URL words must not count as a company name.
const stripUrls = (text = '') => text.replace(/\bhttps?:\/\/\S+/gi, ' ')

function eventEmails(event) {
  return [event.organizerEmail, ...(event.attendeeEmails || [])]
    .filter(Boolean)
    .map(e => e.toLowerCase())
}

// "maher.elouaer@bpifrance.fr" → "bpifrance"; "x@mail.acme.co.uk" → "acme".
function domainLabel(email = '') {
  const host = email.split('@')[1] || ''
  const parts = host.split('.').filter(Boolean)
  if (parts.length < 2) return ''
  const sld = parts.length >= 3 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2]
  return GENERIC_DOMAINS.has(sld) ? '' : sld
}

// The job's position appears as a phrase in the event text.
export function textMatchesPosition(text = '', position = '') {
  const np = normalizeCompanyText(position)
  if (np.length < 4) return false
  return ` ${normalizeCompanyText(text)} `.includes(` ${np} `)
}

function jobContactEmails(job) {
  const emails = new Set()
  for (const h of job.history || []) {
    if (h.fromMe || !h.from) continue
    const p = parseSender(h.from)
    if (p?.email) emails.add(p.email.toLowerCase())
  }
  for (const c of job.contacts || []) if (c?.email) emails.add(c.email.toLowerCase())
  return emails
}

function jobStatus(job) {
  const h = job.history || []
  return (h.length && h[h.length - 1].status) || job.status
}

function hasCalendarMeeting(job) {
  return (job.history || []).some(h => h.source === 'calendar' || h.meetingLink)
}

// Latest interview-invitation entry (status interview, not a calendar entry).
function latestInviteEntry(job) {
  const invites = (job.history || [])
    .filter(h => h?.date && h.status === 'interview' && h.source !== 'calendar')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  return invites[0] || null
}

export function looksLikeBookedInterview(event) {
  const text = eventText(event)
  return event.type === 'interview' || event.type === 'test' || !!schedulingTool(text) || HIRING_WORDS.test(text)
}

// Returns { job, reason } or null.
export function matchEventToJob(event, jobs = []) {
  if (!event) return null
  const active = jobs.filter(j => j && !CLOSED.has(jobStatus(j)))
  const text = eventText(event)
  const emails = eventEmails(event)
  const domains = emails.map(domainLabel).filter(Boolean)

  // 1. Company named in the title/location, or on an organizer/attendee domain.
  //    Not the description: invite boilerplate ("Réunion Microsoft Teams",
  //    "Alimenté par Calendly") would tie the event to an unrelated Microsoft job.
  const byCompany = active.filter(j => j.company && (
    textMatchesCompany(`${event.title || ''} ${stripUrls(event.location)}`, j.company) ||
    domains.some(d => textMatchesCompany(d, j.company))
  ))
  if (byCompany.length === 1) return { job: byCompany[0], reason: 'company' }
  if (byCompany.length > 1) {
    const interviewing = byCompany.filter(j => jobStatus(j) === 'interview')
    return { job: interviewing.length === 1 ? interviewing[0] : byCompany[0], reason: 'company' }
  }

  // 2. Organizer / attendee already known on a candidature.
  if (emails.length) {
    const byContact = active.filter(j => {
      const known = jobContactEmails(j)
      return emails.some(e => known.has(e))
    })
    if (byContact.length === 1) return { job: byContact[0], reason: 'contact' }
    if (byContact.length > 1) return null
  }

  // 3. A booked interview with no company name: attribute it to the one candidature
  //    that was invited to book shortly before and is still waiting for its meeting.
  if (!looksLikeBookedInterview(event)) return null
  const bookedAt = new Date(event.created || event.rawStart || event.date || Date.now()).getTime()
  const startAt = new Date(event.rawStart || event.date || 0).getTime()
  let pending = active.filter(j => {
    if (jobStatus(j) !== 'interview' || hasCalendarMeeting(j)) return false
    const invite = latestInviteEntry(j)
    if (!invite) return false
    const invitedAt = new Date(invite.date).getTime()
    // Invitation precedes the booking (1-day slack for timezones / same-day dates)
    // by at most MAX_BOOKING_LAG_DAYS, and the meeting isn't before the invitation.
    return invitedAt <= bookedAt + DAY &&
      bookedAt - invitedAt <= MAX_BOOKING_LAG_DAYS * DAY &&
      (!startAt || startAt >= invitedAt - DAY)
  })
  if (!pending.length) return null

  const byPosition = pending.filter(j => j.position && textMatchesPosition(text, j.position))
  if (byPosition.length) pending = byPosition

  if (pending.length > 1) {
    const tool = schedulingTool(text)
    if (tool) {
      const sameTool = pending.filter(j => schedulingTool(latestInviteEntry(j)?.note || '') === tool)
      if (sameTool.length) pending = sameTool
    }
  }
  return pending.length === 1 ? { job: pending[0], reason: 'pending-invite' } : null
}
