import { useMemo } from 'react'

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
  const meetings = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)

    const past7 = new Date(today); past7.setDate(today.getDate() - 7)

    const events = []
    for (const job of jobs) {
      if (['archived','rejected','rejected_ats','cancelled'].includes(job.status)) continue
      for (const entry of job.history || []) {
        if (!entry.date) continue
        const d = new Date(entry.date)
        d.setHours(0, 0, 0, 0)

        const hasCalendar = entry.source === 'calendar'
        const hasMeetingLink = !!entry.meetingLink
        if (!hasCalendar && !hasMeetingLink) continue

        // Calendar entries: only future (they have the real meeting date)
        // Email entries with meeting link: show if within last 7 days or future
        //   (email date is receipt date, meeting itself may still be upcoming)
        if (hasCalendar && (d < today || d > in60)) continue
        if (!hasCalendar && hasMeetingLink && (d < past7 || d > in60)) continue

        events.push({
          date: entry.date,
          rawStart: entry.rawStart || null, // ISO datetime if available (calendar events)
          note: entry.note || '',
          company: job.company,
          position: job.position,
          meetingLink: entry.meetingLink,
          source: entry.source,
          isUpcoming: entry.isUpcoming,
        })
      }
    }

    // Sort by date (nearest first), deduplicate by date+company+note
    const seen = new Set()
    return events
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .filter(e => {
        const k = `${e.date}-${e.company}-${e.note}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  }, [jobs])

  if (meetings.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        <span className="text-base">📅</span>
        <h3 className="text-sm font-semibold text-gray-800">{t('upcomingMeetings.title')}</h3>
        <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 font-medium px-2 py-0.5 rounded-full">
          {meetings.length}
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {meetings.map((m, i) => {
          const { label, urgent } = formatDate(m.date)
          const platform = m.meetingLink ? getMeetingPlatform(m.meetingLink) : null
          const note = m.note.replace(/^📅\s*/, '')
          const state = getMeetingState(m)
          const time = formatTime(m.rawStart)

          const rowBg = state === 'done'     ? 'opacity-40'
                      : state === 'imminent' ? 'bg-green-50/60'
                      : urgent               ? 'bg-orange-50/30'
                      : ''

          const dateCls = state === 'done'     ? 'text-gray-400 line-through'
                        : state === 'imminent' ? 'text-green-600'
                        : urgent               ? 'text-orange-600'
                        : 'text-indigo-500'

          const joinCls = state === 'imminent'
            ? 'bg-green-500 border-green-500 text-white hover:bg-green-600'
            : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'

          return (
            <div key={i} className={`px-4 py-3 transition-colors ${rowBg}`}>
              {/* Date + time label */}
              <div className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${dateCls}`}>
                {state === 'imminent' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                {state !== 'imminent' && state !== 'done' && urgent && <span>⚡</span>}
                {state === 'done' && <span>✓</span>}
                <span>{label === 'today' ? t('upcomingMeetings.today') : label === 'tomorrow' ? t('upcomingMeetings.tomorrow') : label}</span>
                {time && <span className="font-normal opacity-80">{time}</span>}
              </div>

              {/* Company + note */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${state === 'done' ? 'text-gray-400' : 'text-gray-800'}`}>{m.company}</p>
                  {note && <p className="text-xs text-gray-400 mt-0.5 truncate">{note}</p>}
                  <p className="text-xs text-gray-300 truncate">{m.position}</p>
                </div>

                {m.meetingLink && state !== 'done' && (
                  <a href={m.meetingLink} target="_blank" rel="noopener noreferrer"
                    title={platform ? t('upcomingMeetings.joinVia').replace('{platform}', platform.name) : t('upcomingMeetings.join')}
                    className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium border px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${joinCls}`}
                  >
                    <span>{platform?.emoji}</span>
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
