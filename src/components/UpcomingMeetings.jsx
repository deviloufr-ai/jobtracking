import { useMemo } from 'react'

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const in7 = new Date(now); in7.setDate(now.getDate() + 7)

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(d, now)) return { label: "Aujourd'hui", urgent: true }
  if (isSameDay(d, tomorrow)) return { label: 'Demain', urgent: true }
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

export default function UpcomingMeetings({ jobs }) {
  const meetings = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)

    const events = []
    for (const job of jobs) {
      if (job.status === 'archived' || job.status === 'rejected' || job.status === 'rejected_ats' || job.status === 'cancelled') continue
      for (const entry of job.history || []) {
        if (!entry.date) continue
        const d = new Date(entry.date)
        d.setHours(0, 0, 0, 0)
        if (d < today || d > in60) continue

        // Include: calendar entries OR email entries with a meeting link
        const hasCalendar = entry.source === 'calendar'
        const hasMeetingLink = !!entry.meetingLink
        if (!hasCalendar && !hasMeetingLink) continue

        events.push({
          date: entry.date,
          note: entry.note || '',
          company: job.company,
          position: job.position,
          meetingLink: entry.meetingLink,
          source: entry.source,
          isUpcoming: entry.isUpcoming,
        })
      }
    }

    // Sort by date, deduplicate by date+company+note
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
        <h3 className="text-sm font-semibold text-gray-800">Meetings à venir</h3>
        <span className="ml-auto text-xs bg-indigo-100 text-indigo-600 font-medium px-2 py-0.5 rounded-full">
          {meetings.length}
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {meetings.map((m, i) => {
          const { label, urgent } = formatDate(m.date)
          const platform = m.meetingLink ? getMeetingPlatform(m.meetingLink) : null
          // Strip the 📅 prefix from calendar notes for cleaner display
          const note = m.note.replace(/^📅\s*/, '')

          return (
            <div key={i} className={`px-4 py-3 ${urgent ? 'bg-orange-50/40' : ''}`}>
              {/* Date label */}
              <div className={`text-xs font-semibold mb-1 ${urgent ? 'text-orange-600' : 'text-indigo-500'}`}>
                {urgent && <span className="mr-1">⚡</span>}{label}
              </div>

              {/* Company + note */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.company}</p>
                  {note && <p className="text-xs text-gray-500 mt-0.5 truncate">{note}</p>}
                  <p className="text-xs text-gray-400 truncate">{m.position}</p>
                </div>

                {/* Meeting link button */}
                {m.meetingLink && (
                  <a
                    href={m.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Rejoindre via ${platform?.name}`}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-medium bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors whitespace-nowrap"
                  >
                    <span>{platform?.emoji}</span>
                    <span>Rejoindre</span>
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
