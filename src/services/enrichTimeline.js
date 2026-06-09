// Enriches a job's timeline using Gmail + Calendar data
import { fetchJobEmails } from './gmail'
import { fetchCalendarEvents, isCalendarConnected } from './calendar'

const IS_DEV = import.meta.env.DEV

// Extract meeting links from text
function extractMeetingLink(text = '') {
  const patterns = [
    // Google Meet
    /(https:\/\/meet\.google\.com\/[a-z0-9\-]+)/i,
    // Zoom
    /(https:\/\/[a-z0-9]+\.zoom\.us\/j\/[^\s"<>]+)/i,
    // Microsoft Teams
    /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+)/i,
    // Whereby
    /(https:\/\/whereby\.com\/[^\s"<>]+)/i,
    // Around
    /(https:\/\/around\.co\/[^\s"<>]+)/i,
    // Webex
    /(https:\/\/[a-z0-9]+\.webex\.com\/[^\s"<>]+)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return null
}

function detectMeetingPlatform(url = '') {
  if (url.includes('meet.google.com')) return { name: 'Google Meet', emoji: '🟢' }
  if (url.includes('zoom.us')) return { name: 'Zoom', emoji: '🔵' }
  if (url.includes('teams.microsoft.com')) return { name: 'Teams', emoji: '🟣' }
  if (url.includes('whereby.com')) return { name: 'Whereby', emoji: '🟠' }
  if (url.includes('webex.com')) return { name: 'Webex', emoji: '🔷' }
  return { name: 'Visio', emoji: '📹' }
}

async function analyzeEmailsForTimeline(emails, companyName) {
  if (IS_DEV) return getMockTimeline(companyName)

  const emailsText = emails
    .slice(0, 30)
    .map((e, i) => `[${i+1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${e.date}\nAperçu: ${e.snippet}`)
    .join('\n\n---\n\n')

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Tu analyses des emails liés à une candidature chez "${companyName}".
Extrait CHAQUE événement important comme une entrée SÉPARÉE dans la timeline.

RÈGLE IMPORTANTE : chaque email = potentiellement plusieurs événements distincts. Ne fusionne JAMAIS plusieurs événements en un seul. Si un email mentionne "call puis test technique", crée 2 entrées séparées.

Pour chaque événement retourne un objet JSON avec :
- date: YYYY-MM-DD (date de l'email ou de l'événement mentionné)
- status: exactement un de : "sent" | "reviewing" | "interview" | "waiting" | "offer" | "rejected" | "rejected_ats" | "cancelled"
- note: UNE SEULE action ou information courte (max 80 chars, PAS de pipe |, PAS de concaténation)
- meetingLink: URL du lien visio si présent dans l'email (Google Meet, Zoom, Teams), sinon null
- source: "email"

Exemples CORRECTS (une action par entrée) :
[
  {"date":"2026-06-01","status":"sent","note":"Candidature envoyée via LinkedIn","source":"email"},
  {"date":"2026-06-02","status":"reviewing","note":"Accusé de réception automatique","source":"email"},
  {"date":"2026-06-03","status":"interview","note":"Invitation call RH 15min","source":"email"},
  {"date":"2026-06-04","status":"interview","note":"Call RH passé - profil retenu","source":"email"},
  {"date":"2026-06-05","status":"waiting","note":"Test technique envoyé","source":"email"}
]

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après, sans backticks.

Emails:
\${emailsText}\``
      }]
    })
  })

  if (!res.ok) return []
  const data = await res.json()
  const text = data.content?.[0]?.text || '[]'
  try {
    const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim()
    return JSON.parse(clean)
  } catch { return [] }
}

function getMockTimeline(company) {
  return [
    { date: new Date(Date.now() - 20*24*60*60*1000).toISOString().split('T')[0], status: 'sent', note: `Candidature envoyée chez ${company}`, source: 'email' },
    { date: new Date(Date.now() - 15*24*60*60*1000).toISOString().split('T')[0], status: 'reviewing', note: 'Accusé de réception automatique', source: 'email' },
    { date: new Date(Date.now() - 10*24*60*60*1000).toISOString().split('T')[0], status: 'interview', note: 'Invitation entretien RH - visio 30min', source: 'email', meetingLink: 'https://meet.google.com/abc-defg-hij', meetingPlatform: 'Google Meet', meetingEmoji: '🟢' },
  ]
}

export async function enrichJobTimeline(job, { calendarOnly = false } = {}) {
  const events = []

  // 1. Email enrichment — skipped when calendarOnly (already done during Gmail import)
  if (!calendarOnly) {
    try {
      // Use smart incremental sync: only fetch emails since last sync
      const emails = await fetchJobEmails(null, 1/30, null, job.lastSyncTime)
      if (emails.length > 0) {
        const emailEvents = await analyzeEmailsForTimeline(emails, job.company)
        events.push(...emailEvents.map(e => ({ ...e, source: 'email' })))
      }
    } catch (e) {
      console.warn('Email enrichment failed:', e.message)
    }
  }

  // 2. Fetch calendar events
  try {
    if (isCalendarConnected()) {
      const calEvents = await fetchCalendarEvents(job.company, 12)
      const calTimeline = calEvents.map(e => {
        // calendar.js already extracts meetingLink; fall back to re-extracting from description/location
        const meetLink = e.meetingLink || extractMeetingLink(e.description) || extractMeetingLink(e.location)
        const platform = meetLink ? detectMeetingPlatform(meetLink) : null
        return {
          date: e.date,
          status: e.type === 'interview' ? 'interview' : e.type === 'offer' ? 'offer' : 'waiting',
          note: `📅 ${e.title}${e.location && !meetLink ? ` — ${e.location}` : ''}${e.isUpcoming ? ' (à venir)' : ''}`,
          source: 'calendar',
          isUpcoming: e.isUpcoming,
          meetingLink: meetLink || undefined,
          meetingPlatform: platform?.name,
          meetingEmoji: platform?.emoji,
        }
      })
      events.push(...calTimeline)
    }
  } catch (e) {
    console.warn('Calendar enrichment failed:', e.message)
  }

  if (events.length === 0) return null

  // Merge with existing history
  // If a calendar event matches an existing entry by date+status, inject its meeting link
  const existingByKey = new Map((job.history || []).map(h => [`${h.date}-${h.status}`, h]))

  const newEvents = []
  for (const e of events) {
    const key = `${e.date}-${e.status}`
    if (existingByKey.has(key)) {
      // Entry already exists — inject meeting link if we now have one
      const existing = existingByKey.get(key)
      if (e.meetingLink && !existing.meetingLink) {
        existing.meetingLink = e.meetingLink
        existing.meetingPlatform = e.meetingPlatform
        existing.meetingEmoji = e.meetingEmoji
      }
    } else {
      newEvents.push(e)
    }
  }

  // Merge and sort chronologically
  const merged = [...(job.history || []), ...newEvents]
  merged.sort((a, b) => new Date(a.date) - new Date(b.date))

  // Return even if no new events — meeting links may have been injected into existing entries
  const hadUpdates = events.some(e => {
    const key = `${e.date}-${e.status}`
    return existingByKey.has(key) && e.meetingLink
  })
  if (newEvents.length === 0 && !hadUpdates) return null

  return { newCount: newEvents.length, history: merged }
}

async function fetchEmailsForCompany(company) {
  // Use a targeted Gmail search for this company
  const { getAccessToken } = await import('./gmail')
  const token = getAccessToken()
  if (!token) return []

  const query = encodeURIComponent(`from:${company.toLowerCase().replace(/\s+/g, '')} OR subject:"${company}" newer_than:365d`)
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=${query}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const messages = data.messages || []

  const emails = await Promise.all(messages.slice(0, 20).map(async m => {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!r.ok) return null
    const d = await r.json()
    const headers = d.payload?.headers || []
    const get = n => headers.find(h => h.name === n)?.value || ''
    const body = d.payload?.body?.data 
      ? atob(d.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      : ''
    const snippet = d.snippet || ''
    const meetingLink = extractMeetingLink(body) || extractMeetingLink(snippet)
    return { 
      id: d.id, 
      subject: get('Subject'), 
      from: get('From'), 
      date: get('Date'), 
      snippet,
      meetingLink
    }
  }))

  return emails.filter(Boolean)
}
