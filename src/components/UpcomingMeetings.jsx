import { useMemo, useState, useEffect, useCallback } from 'react'
import { fetchCalendarEvents, isCalendarConnected } from '../services/calendar'

// Normalize for fuzzy company matching: lowercase, strip accents + punctuation
function normalize(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// A calendar event is "job-related" if its title matches a tracked company
// OR it looks like an interview/test/offer (type detected in calendar.js).
// Returns the matched job (for position enrichment) or null.
function matchJob(event, activeJobs) {
  const title = normalize(event.title)
  for (const job of activeJobs) {
    const company = normalize(job.company)
    if (company.length >= 3 && (title.includes(company) || company.includes(title))) {
      return job
    }
  }
  return null
}

function formatTime(rawStart) {
  if (!rawStart || rawStart.length === 10) return null // date-only, no time
  return new Date(rawStart).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Returns visual state based on proximity to meeting start time
// 'imminent' : from -5min to +3h (solid green — meeting happening now)
// 'upcoming' : more than 5min away (washed-out green — soon)
// 'done'     : past start + 3h (greyed out)
function getMeetingState(event) {
  if (!event.rawStart) {
    // No precise time — use date-only heuristic
    const d = new Date(event.date); d.setHours(23, 59, 59)
    return d.getTime() + 2 * 3600 * 1000 < Date.now() ? 'done' : 'upcoming'
  }
  const start = new Date(event.rawStart).getTime()
  const now = Date.now()
  const diff = start - now  // ms until start (negative = started)
  if (now > start + 3 * 3600 * 1000) return 'done'
  if (diff <= 5 * 60 * 1000) return 'imminent'   // within 5 min or already started
  return 'upcoming'
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const in7 = new Date(now); in7.setDate(now.getDate() + 7)

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(d, now)) return { label: 'today', urgent: true }
  if (isSameDay(d, tomorrow)) return { label: 'tomorrow', urgent: true }
  if (d <= in7) return {
    label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }),
    urgent: false,
  }
  return {
    label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }),
    urgent: false,
  }
}

function getMeetingPlatform(url = '') {
  if (url.includes('meet.google.com')) return { name: 'Meet', emoji: '🟢' }
  if (url.includes('zoom.us')) return { name: 'Zoom', emoji: '🔵' }
  if (url.includes('teams.microsoft.com')) return { name: 'Teams', emoji: '🟣' }
  if (url.includes('whereby.com')) return { name: 'Whereby', emoji: '🟠' }
  if (url.includes('webex.com')) return { name: 'Webex', emoji: '🔷' }
  return { name: 'Visio', emoji: '📹' }
}

export default function UpcomingMeetings({ jobs, t = (key) => key }) {
  const [rawEvents, setRawEvents] = useState([])
  const [loading, setLoading] = useState(false)

  // Active jobs only — used to match calendar events to a tracked application
  // (so we can show the company + position and filter out non-job events).
  const activeJobs = useMemo(
    () => jobs.filter(j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status)),
    [jobs]
  )

  // Fetch upcoming events straight from Google Calendar — reliable times, no
  // dependency on Gmail-sync enrichment having run.
  const load = useCallback(async () => {
    if (!isCalendarConnected()) return
    setLoading(true)
    try {
      const events = await fetchCalendarEvents('', 2) // ~2 months ahead
      setRawEvents(events)
    } catch {
      setRawEvents([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const meetings = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)

    const events = []
    for (const e of rawEvents) {
      if (!e.date) continue
      const d = new Date(e.date); d.setHours(0, 0, 0, 0)
      if (d < today || d > in60) continue

      // "Only job-related": keep events that match a tracked company OR look
      // like an interview/test/offer (type detected from the title).
      const job = matchJob(e, activeJobs)
      const isInterviewType = ['interview', 'test', 'offer'].includes(e.type)
      if (!job && !isInterviewType) continue

      events.push({
        date: e.date,
        rawStart: e.rawStart || null, // full datetime straight from the Calendar API
        // When matched to a job, the company is the job's name, so the event
        // title is the useful "what/who" detail. With no match, the title is
        // already shown as the heading — surface the location instead.
        note: job ? (e.title || '') : '',
        company: job ? job.company : e.title,
        position: job ? job.position : (e.location ? `📍 ${e.location}` : ''),
        meetingLink: e.meetingLink,
        source: 'calendar',
        isUpcoming: e.isUpcoming,
      })
    }

    // Sort by start time (nearest first), deduplicate by date+company+note
    const seen = new Set()
    return events
      .sort((a, b) => new Date(a.rawStart || a.date) - new Date(b.rawStart || b.date))
      .filter(e => {
        const k = `${e.date}-${e.company}-${e.note}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  }, [rawEvents, activeJobs])

  if (!isCalendarConnected() || meetings.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2 bg-gray-50">
        <span className="text-base">📅</span>
        <h3 className="text-sm font-semibold text-gray-800">{t('upcomingMeetings.title')}</h3>
        <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 font-medium px-2 py-0.5 rounded-full">
          {meetings.length}
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {meetings.map((m, i) => {
          const { label, urgent } = formatDate(m.date)
          const platform = m.meetingLink ? getMeetingPlatform(m.meetingLink) : null
          const note = m.note.replace(/^📅\s*/, '')
          const state = getMeetingState(m)
          const time = formatTime(m.rawStart)

          const rowBg = state === 'done'     ? 'opacity-50 bg-gray-50'
                      : state === 'imminent' ? 'bg-green-50'
                      : urgent               ? 'bg-orange-50/40'
                      : 'hover:bg-gray-50'

          const dateCls = state === 'done'     ? 'text-gray-400 line-through'
                        : state === 'imminent' ? 'text-green-600 font-bold'
                        : urgent               ? 'text-orange-600 font-bold'
                        : 'text-indigo-600 font-semibold'

          const joinCls = state === 'imminent'
            ? 'bg-green-500 border-green-500 text-white hover:bg-green-600 shadow-sm'
            : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'

          return (
            <div key={i} className={`px-4 py-4 transition-all ${rowBg}`}>
              {/* Top row: Date/Time + Platform indicator */}
              <div className="flex items-center justify-between mb-3">
                <div className={`flex items-center gap-2.5`}>
                  {state === 'imminent' && <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                  {state !== 'imminent' && state !== 'done' && urgent && <span className="text-lg">⚡</span>}
                  {state === 'done' && <span className="text-lg">✓</span>}
                  <div>
                    <div className={`text-xs font-semibold ${dateCls}`}>
                      {label === 'today' ? t('upcomingMeetings.today') : label === 'tomorrow' ? t('upcomingMeetings.tomorrow') : label}
                    </div>
                    {time && (
                      <div className={`text-sm font-semibold ${state === 'done' ? 'text-gray-400' : 'text-gray-900'}`}>
                        🕐 {time}
                      </div>
                    )}
                  </div>
                </div>
                {platform && <span className="text-lg" title={platform.name}>{platform.emoji}</span>}
              </div>

              {/* Company + Position row */}
              <div className="mb-2">
                <p className={`text-sm font-semibold ${state === 'done' ? 'text-gray-400' : 'text-gray-900'}`}>
                  {m.company}
                </p>
                {m.position && (
                  <p className={`text-xs ${state === 'done' ? 'text-gray-350' : 'text-gray-600'}`}>
                    {m.position}
                  </p>
                )}
              </div>

              {/* Meeting subject (who is joining) */}
              {note && (
                <div className={`text-sm mb-3 p-2.5 rounded-lg border ${state === 'done' ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-blue-50 border-blue-100 text-gray-700'}`}>
                  <span className="font-medium">👤 </span>{note}
                </div>
              )}

              {/* Join button */}
              {m.meetingLink && state !== 'done' && (
                <div className="flex justify-end">
                  <a href={m.meetingLink} target="_blank" rel="noopener noreferrer"
                    title={platform ? t('upcomingMeetings.joinVia').replace('{platform}', platform.name) : t('upcomingMeetings.join')}
                    className={`flex items-center gap-1.5 text-sm font-semibold border px-3 py-2 rounded-lg transition-all ${joinCls}`}
                  >
                    <span>{platform?.emoji}</span>
                    <span>{t('upcomingMeetings.join')}</span>
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
