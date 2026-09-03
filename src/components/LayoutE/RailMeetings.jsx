// RailMeetings — compact "upcoming interviews" card for the NavRail (left panel).
//
// The full home widget (UpcomingMeetings) is built for a wide column and looks
// oversized in the ~196px rail, so this is a slim variant fed by the same shared
// hook. Shows up to 3 nearest job-related meetings: when · company · Join.
// Self-hides (renders null) when there's nothing upcoming or no calendar.
import { useUpcomingMeetings } from '../../hooks/useUpcomingMeetings'

function whenLabel(m, t) {
  const d = new Date(m.rawStart || m.date)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()

  let day
  if (sameDay(d, now)) day = t('upcomingMeetings.today')
  else if (sameDay(d, tomorrow)) day = t('upcomingMeetings.tomorrow')
  else day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

  const hasTime = m.rawStart && m.rawStart.length > 10
  const time = hasTime ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null
  return time ? `${day} · ${time}` : day
}

export default function RailMeetings({ jobs, t = (k) => k }) {
  const { meetings } = useUpcomingMeetings(jobs)
  if (meetings.length === 0) return null

  const shown = meetings.slice(0, 3)

  return (
    <div className="mx-3 mb-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2 shrink-0">
      <div className="flex items-center gap-1.5 px-0.5 mb-1.5">
        <span className="text-xs leading-none" aria-hidden>🎯</span>
        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide truncate">
          {t('upcomingMeetings.title')}
        </span>
        <span className="ml-auto text-[10px] font-bold text-indigo-500 bg-white/70 rounded-full px-1.5 leading-tight">
          {meetings.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {shown.map((m, i) => {
          const note = (m.note || '').replace(/^📅\s*/, '')
          return (
            <div key={i} className="rounded-lg bg-white border border-gray-100 p-2">
              <div className="text-[10px] font-semibold text-amber-600 capitalize leading-tight">{whenLabel(m, t)}</div>
              <div className="text-[12px] font-bold text-gray-900 leading-snug truncate mt-0.5" title={m.company}>{m.company}</div>
              {note && <div className="text-[10px] text-gray-500 truncate leading-tight" title={note}>{note}</div>}
              {m.meetingLink && (
                <a
                  href={m.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md py-1 transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M6.3 2.84A1 1 0 0 0 5 3.83v12.34a1 1 0 0 0 1.55.83l9.22-6.17a1 1 0 0 0 0-1.66z" /></svg>
                  {t('upcomingMeetings.join')}
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
