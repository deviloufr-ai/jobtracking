// Google Calendar service - reuses Gmail OAuth token (same scope request)
import { getAccessToken } from './gmail'

export function isCalendarConnected() {
  return !!getAccessToken()
}

export async function fetchCalendarEvents(companyName, monthsBack = 12) {
  const token = getAccessToken()
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
    maxResults: '100',
  })
  // When a company name is given, restrict the search (single-company lookup)
  if (companyName) params.set('q', companyName)

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!res.ok) return []

  const data = await res.json()
  const events = data.items || []

  return events.map(e => {
    const start = e.start?.dateTime || e.start?.date || ''
    const date = start ? new Date(start).toISOString().split('T')[0] : ''
    const isUpcoming = start && new Date(start) > new Date()
    return {
      id: e.id,
      title: e.summary || 'Événement',
      date,
      description: e.description || '',
      location: e.location || '',
      isUpcoming,
      source: 'calendar',
      type: detectEventType(e.summary || ''),
    }
  }).filter(e => e.date)
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
