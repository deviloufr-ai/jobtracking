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

// Normalize meeting content for deduplication (lowercase, remove extra spaces/punctuation)
function normalizeMeetingContent(text = '') {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[()àâäæéèêëïîôöùûüœç]/g, c => {
      const map = { 'à': 'a', 'â': 'a', 'ä': 'a', 'æ': 'ae', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ï': 'i', 'î': 'i', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'û': 'u', 'ü': 'u', 'œ': 'oe', 'ç': 'c' }
      return map[c] || c
    })
    .replace(/[^\w\s]/g, '')
}

// Check if a similar meeting already exists in history (by date + normalized content)
function hasSimilarMeeting(note, date, history) {
  const normalized = normalizeMeetingContent(note)
  const sameDay = (history || []).filter(h => h.date === date)
  return sameDay.some(h => normalizeMeetingContent(h.note) === normalized)
}

function detectMeetingPlatform(url = '') {
  if (url.includes('meet.google.com')) return { name: 'Google Meet', emoji: '🟢' }
  if (url.includes('zoom.us')) return { name: 'Zoom', emoji: '🔵' }
  if (url.includes('teams.microsoft.com')) return { name: 'Teams', emoji: '🟣' }
  if (url.includes('whereby.com')) return { name: 'Whereby', emoji: '🟠' }
  if (url.includes('webex.com')) return { name: 'Webex', emoji: '🔷' }
  return { name: 'Visio', emoji: '📹' }
}

// Merge date + time into ISO datetime string (YYYY-MM-DDTHH:mm:00)
function mergeDateAndTime(date, time) {
  if (!date) return date
  if (!time) return date
  // If date already has time (contains T), return as-is
  if (date.includes('T')) return date
  // Combine date + time into ISO format
  return `${date}T${time}:00`
}

// Auto-mark meetings as done when 1+ hour has passed, and remove "À venir" label
function autoCompletePastMeetings(history) {
  if (!history || history.length === 0) return history

  const now = new Date()
  const updated = [...history]

  // For each calendar event, check if it's 1+ hour past start time
  for (let i = 0; i < updated.length; i++) {
    const entry = updated[i]
    if (entry.source !== 'calendar' || !entry.date) continue

    const eventTime = new Date(entry.date)
    const oneHourAfter = new Date(eventTime.getTime() + 1 * 60 * 60 * 1000)

    // If meeting finished (1+ hour past) and entry is still upcoming
    if (now > oneHourAfter && entry.status !== 'done') {
      // Mark this calendar entry as done
      entry.status = 'done'
      // Remove "(à venir)" from the note
      entry.note = entry.note.replace(/\s*\(à venir\)\s*$/i, '')
      // Also mark the previous non-calendar entry as done if it exists
      for (let j = i - 1; j >= 0; j--) {
        const prevEntry = updated[j]
        if (prevEntry.source === 'email' && prevEntry.status !== 'done' && prevEntry.status !== 'rejected' && prevEntry.status !== 'rejected_ats' && prevEntry.status !== 'cancelled') {
          prevEntry.status = 'done'
          prevEntry.note = `${prevEntry.note} ✓`
          break
        }
      }
    }
  }

  return updated
}

async function analyzeEmailsForTimeline(emails, companyName) {
  if (IS_DEV) return getMockTimeline(companyName)

  const emailsText = emails
    .slice(0, 30)
    .map((e, i) => {
      // Use full body if available, otherwise fall back to snippet
      const content = (e.body || e.snippet || '').slice(0, 1500)
      return `[${i+1}] De: ${e.from}\nSujet: ${e.subject}\nDate: ${e.date}\nContenu: ${content}`
    })
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
RÈGLE PRINCIPALE : Pour chaque DATE UNIQUE, crée UNE SEULE entrée consolidée qui résume tous les événements de cette date.

CONSOLIDATION :
- Une seule entrée par date (même si 5 emails ce jour)
- La note doit être un résumé listant les points clés (max 2-3 points)
- Utilise le statut MAXIMUM atteint (sent < reviewing < interview < waiting/offer < done)
- Déduplique les informations répétées
- Si plusieurs informations sur la même date, sépare par " | "

Pour chaque date retourne un objet JSON avec :
- date: YYYY-MM-DD (date de l'email ou de l'événement mentionné)
- time: HH:mm si l'heure d'une action importante est mentionnée (ex: "14:30"), sinon null
- status: le statut MAXIMUM atteint ce jour-là : "sent" | "reviewing" | "interview" | "waiting" | "offer" | "rejected" | "rejected_ats" | "cancelled" | "done"
- note: Résumé concis de 150-200 chars avec points clés séparés par " | "
- meetingLink: URL du lien visio si présent, sinon null
- source: "email"

Exemples CORRECTS (une entrée par date) :
[
  {"date":"2026-06-01","time":null,"status":"sent","note":"Candidature envoyée via LinkedIn","source":"email"},
  {"date":"2026-06-02","time":"14:30","status":"interview","note":"Invitation entretien RH visio 30min | Écart salarial 40-42k, négociation possible","source":"email","meetingLink":"https://meet.google.com/xyz"},
  {"date":"2026-06-03","time":"14:45","status":"interview","note":"Entretien passé - profil retenu | Prétention 55K CDI | Disponibilité immédiate","source":"email"},
  {"date":"2026-06-04","time":null,"status":"waiting","note":"Test technique envoyé | Réponse attendue 1 semaine","source":"email"}
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
        // Merge date + time for events that have time information
        events.push(...emailEvents.map(e => ({
          ...e,
          date: mergeDateAndTime(e.date, e.time),
          source: 'email'
        })))
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
        // Extract time from rawStart (if it's a datetime, not just a date)
        let time = null
        if (e.rawStart && e.rawStart.includes('T')) {
          const timeMatch = e.rawStart.match(/T(\d{2}:\d{2})/)
          if (timeMatch) time = timeMatch[1]
        }
        return {
          date: mergeDateAndTime(e.date, time),
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

  // Build set of existing meeting links to prevent duplicate meetings
  const existingMeetingLinks = new Set()
  for (const h of job.history || []) {
    if (h.meetingLink) existingMeetingLinks.add(h.meetingLink)
  }

  const newEvents = []
  for (const e of events) {
    // Skip if this exact meeting link already exists in the candidature
    if (e.meetingLink && existingMeetingLinks.has(e.meetingLink)) {
      continue
    }

    // Skip if similar meeting content already exists on the same day
    if (hasSimilarMeeting(e.note, e.date, job.history)) {
      continue
    }

    const key = `${e.date}-${e.status}`
    if (existingByKey.has(key)) {
      // Entry already exists — inject meeting link if we now have one
      const existing = existingByKey.get(key)
      if (e.meetingLink && !existing.meetingLink) {
        existing.meetingLink = e.meetingLink
        existing.meetingPlatform = e.meetingPlatform
        existing.meetingEmoji = e.meetingEmoji
        existingMeetingLinks.add(e.meetingLink)
      }
    } else {
      // For email events with meeting links: create a "decision" entry without the link
      // The actual meeting will be added via calendar event (with correct date/time)
      if (e.source === 'email' && e.meetingLink) {
        // Add decision entry (without meeting link)
        newEvents.push({
          date: e.date,
          status: e.status,
          note: `${e.note.replace(/📅|📧/g, '').trim()}`,
          source: 'email',
          // Explicitly NOT including meetingLink here
        })
        existingMeetingLinks.add(e.meetingLink)
      } else {
        newEvents.push(e)
        if (e.meetingLink) existingMeetingLinks.add(e.meetingLink)
      }
    }
  }

  // Merge and sort chronologically
  const merged = [...(job.history || []), ...newEvents]
  merged.sort((a, b) => new Date(a.date) - new Date(b.date))

  // Auto-mark previous items as done when their meeting is 2+ hours in the past
  const autoCompleted = autoCompletePastMeetings(merged)

  // Return even if no new events — meeting links may have been injected into existing entries
  const hadUpdates = events.some(e => {
    const key = `${e.date}-${e.status}`
    return existingByKey.has(key) && e.meetingLink
  })
  if (newEvents.length === 0 && !hadUpdates) return null

  return { newCount: newEvents.length, history: autoCompleted }
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
