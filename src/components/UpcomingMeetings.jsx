import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { fetchCalendarEvents, isCalendarConnected } from '../services/calendar'
import { textMatchesCompany } from '../utils/companyMatch'

// A calendar event is "job-related" if its title matches a tracked company
// OR it looks like an interview/test/offer (type detected in calendar.js).
// Returns the matched job (for position enrichment) or null.
//
// Matching is token-based (see companyMatch.js): a job named "Wivoo, a Wavestone
// Company" matches an event titled "… premier échange Wivoo" on the shared
// "Wivoo" token — plain full-string containment missed that link.
function matchJob(event, activeJobs) {
  for (const job of activeJobs) {
    if (textMatchesCompany(event.title, job.company)) {
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
// 'imminent' : from -5min to +1h (solid green — meeting happening now)
// 'upcoming' : more than 5min away (washed-out green — soon)
// 'done'     : past start + 1h (greyed out)
function getMeetingState(event) {
  if (!event.rawStart) {
    // No precise time — use date-only heuristic
    const d = new Date(event.date); d.setHours(23, 59, 59)
    return d.getTime() < Date.now() ? 'done' : 'upcoming'
  }
  const start = new Date(event.rawStart).getTime()
  const now = Date.now()
  const diff = start - now  // ms until start (negative = started)
  if (now > start + 60 * 60 * 1000) return 'done'
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
  const lastLoad = useRef(0)
  const load = useCallback(async () => {
    if (!isCalendarConnected()) return
    lastLoad.current = Date.now()
    setLoading(true)
    try {
      const events = await fetchCalendarEvents('', 2) // ~2 months ahead
      setRawEvents(events)
    } catch {
      setRawEvents([])
    }
    setLoading(false)
  }, [])

  // Load on mount, and refresh when the set of connected Google accounts
  // changes (a newly-connected account may hold the interview) or when the tab
  // regains focus (e.g. the user just accepted an invite in another tab) — the
  // widget otherwise fetched only once, so a freshly-accepted invite stayed
  // invisible until a full reload. Visibility reloads are throttled to 60s.
  useEffect(() => {
    load()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60000) load()
    }
    window.addEventListener('jobtrackr:gmail-accounts-updated', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('jobtrackr:gmail-accounts-updated', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header — gradient banner */}
      <div className="px-4 py-3 flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
        <span className="text-base">🎯</span>
        <h3 className="text-sm font-semibold tracking-tight">{t('upcomingMeetings.title')}</h3>
        <span className="ml-auto text-xs bg-white/25 text-white font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          {meetings.length}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {meetings.map((m, i) => {
          const { label, urgent } = formatDate(m.date)
          const platform = m.meetingLink ? getMeetingPlatform(m.meetingLink) : null
          const note = m.note.replace(/^📅\s*/, '')
          const state = getMeetingState(m)
          const time = formatTime(m.rawStart)
          const dateLabel = label === 'today' ? t('upcomingMeetings.today')
                          : label === 'tomorrow' ? t('upcomingMeetings.tomorrow') : label

          // Per-state accent system drives the rail, chip, and button colors.
          const accent = state === 'done'     ? { rail: 'bg-gray-300',   chip: 'bg-gray-100 text-gray-400',     btn: 'bg-gray-100 text-gray-400 cursor-default' }
                       : state === 'imminent' ? { rail: 'bg-green-500',  chip: 'bg-green-100 text-green-700',   btn: 'bg-green-500 text-white hover:bg-green-600 shadow-sm shadow-green-200' }
                       : urgent               ? { rail: 'bg-amber-400',   chip: 'bg-amber-100 text-amber-700',   btn: 'bg-indigo-600 text-white hover:bg-indigo-700' }
                       :                         { rail: 'bg-indigo-400', chip: 'bg-indigo-50 text-indigo-700',  btn: 'bg-indigo-600 text-white hover:bg-indigo-700' }

          return (
            <div key={i}
              className={`relative flex rounded-xl border border-gray-100 bg-white overflow-hidden transition-all hover:shadow-md ${state === 'done' ? 'opacity-60' : ''}`}>
              {/* Colored accent rail */}
              <div className={`w-1.5 flex-shrink-0 ${accent.rail}`} />

              <div className="flex-1 min-w-0 p-3">
                {/* Date·time chip + platform badge */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${accent.chip}`}>
                    {state === 'imminent' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                    {state === 'done' && <span>✓</span>}
                    <span className="capitalize">{dateLabel}</span>
                    {time && <><span className="opacity-40">·</span><span>{time}</span></>}
                  </span>
                  {platform && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-md flex-shrink-0">
                      <span>{platform.emoji}</span>{platform.name}
                    </span>
                  )}
                </div>

                {/* Company + position */}
                <p className={`text-sm font-bold leading-snug ${state === 'done' ? 'text-gray-400' : 'text-gray-900'}`}>
                  {m.company}
                </p>
                {m.position && (
                  <p className={`text-xs mt-0.5 ${state === 'done' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {m.position}
                  </p>
                )}

                {/* Interview detail (who / what) */}
                {note && (
                  <p className="flex items-start gap-1.5 text-xs text-gray-600 mt-2 leading-relaxed">
                    <span className="flex-shrink-0">👤</span>
                    <span>{note}</span>
                  </p>
                )}

                {/* Join button — full width, modern */}
                {m.meetingLink && state !== 'done' && (
                  <a href={m.meetingLink} target="_blank" rel="noopener noreferrer"
                    title={platform ? t('upcomingMeetings.joinVia').replace('{platform}', platform.name) : t('upcomingMeetings.join')}
                    className={`mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg transition-all ${accent.btn}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.3 2.84A1 1 0 0 0 5 3.83v12.34a1 1 0 0 0 1.55.83l9.22-6.17a1 1 0 0 0 0-1.66z" /></svg>
                    <span>{t('upcomingMeetings.join')}</span>
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
