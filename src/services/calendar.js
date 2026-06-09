// Google Calendar service - reuses Gmail OAuth token (same scope request)
import { getAccessToken, getConnectedAccounts } from './gmail'

function extractLink(text = '') {
  const patterns = [
    /(https:\/\/meet\.google\.com\/[a-z0-9\-]+)/i,
    /(https:\/\/[a-z0-9]+\.zoom\.us\/j\/[^\s"<>]+)/i,
    /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+)/i,
    /(https:\/\/whereby\.com\/[^\s"<>]+)/i,
    /(https:\/\/[a-z0-9]+\.webex\.com\/[^\s"<>]+)/i,
  ]
  for (const p of patterns) { const m = text.match(p); if (m) return m[1] }
  return null
}

export function isCalendarConnected() {
  return !!getAccessToken()
}

// Fetch from a single token
async function fetchCalendarEventsForToken(token, companyName, monthsBack = 12) {
  if (!token) return []

  const timeMin = new Date()
  timeMin.setMonth(timeMin.getMonth() - monthsBack)
  const timeMax = new Date()
  timeMax.setMonth(timeMax.getMonth() + 3)

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  if (companyName) params.set('q', companyName)

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.items || []).map(e => {
      const start = e.start?.dateTime || e.start?.date || ''
      const date = start ? new Date(start).toISOString().split('T')[0] : ''
      const isUpcoming = start && new Date(start) > new Date()
      const desc = e.description || ''
      const loc = e.location || ''
      const meetingLink = extractLink(desc) || extractLink(loc) || extractLink(e.hangoutLink || '')
      return {
        id: e.id,
        title: e.summary || 'Événement',
        date, rawStart: start, description: desc, location: loc,
        isUpcoming, source: 'calendar',
        type: detectEventType(e.summary || ''),
        meetingLink: meetingLink || undefined,
      }
    }).filter(e => {
      // Exclude birthdays, anniversaries, and personal events
      const title = (e.summary || '').toLowerCase()
      const isBirthday = title.includes('birthday') || title.includes('anniversaire') ||
                         title.includes('anniversary') || e.eventType === 'birthday'
      return e.date && !isBirthday
    })
  } catch { return [] }
}

// Fetch from all connected accounts and merge (deduplicated by event id)
export async function fetchCalendarEvents(companyName, monthsBack = 12) {
  const accounts = getConnectedAccounts()

  if (accounts.length > 1) {
    const perAccount = await Promise.all(
      accounts.map(acct => {
        const token = getAccessToken(acct.email)
        return fetchCalendarEventsForToken(token, companyName, monthsBack)
      })
    )
    const seen = new Set()
    const merged = []
    for (const events of perAccount) {
      for (const e of events) {
        if (!seen.has(e.id)) { seen.add(e.id); merged.push(e) }
      }
    }
    return merged.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Single account
  const token = getAccessToken()
  return fetchCalendarEventsForToken(token, companyName, monthsBack)
}

function detectEventType(title) {
  const t = title.toLowerCase()
  if (t.includes('entretien') || t.includes('interview') || t.includes('call') ||
      t.includes('meeting') || t.includes('visio') || t.includes('rdv') ||
      t.includes('rendez-vous') || t.includes('zoom') || t.includes('teams') ||
      t.includes('meet')) return 'interview'
  if (t.includes('test') || t.includes('technique') || t.includes('technical') ||
      t.includes('case study') || t.includes('assessment')) return 'test'
  if (t.includes('onboarding') || t.includes('welcome')) return 'offer'
  return 'event'
}
