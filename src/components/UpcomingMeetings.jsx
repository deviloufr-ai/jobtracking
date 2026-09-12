import { useUpcomingMeetings } from '../hooks/useUpcomingMeetings'

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

export default function UpcomingMeetings({ jobs, t = (key) => key, onJoin }) {
  const { meetings } = useUpcomingMeetings(jobs)

  if (meetings.length === 0) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header — slim gradient banner */}
      <div className="px-3.5 py-2 flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
        <span className="text-sm">🎯</span>
        <h3 className="text-[13px] font-semibold tracking-tight">{t('upcomingMeetings.title')}</h3>
        <span className="ml-auto text-[11px] bg-white/25 text-white font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          {meetings.length}
        </span>
      </div>

      {/* Compact one-row-per-meeting list */}
      <div className="divide-y divide-gray-50">
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
            <div key={i} className={`flex items-center ${state === 'done' ? 'opacity-60' : ''}`}>
              {/* Colored accent rail */}
              <div className={`w-1 self-stretch flex-shrink-0 ${accent.rail}`} />

              <div className="flex-1 min-w-0 flex items-center gap-3 py-2.5 pl-3 pr-3">
                <div className="min-w-0 flex-1">
                  {/* Date·time chip + platform badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${accent.chip}`}>
                      {state === 'imminent' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                      {state === 'done' && <span>✓</span>}
                      <span className="capitalize">{dateLabel}</span>
                      {time && <><span className="opacity-40">·</span><span>{time}</span></>}
                    </span>
                    {platform && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-md">
                        <span>{platform.emoji}</span>{platform.name}
                      </span>
                    )}
                  </div>

                  {/* Company · position */}
                  <p className={`text-[13px] font-bold leading-snug mt-1 truncate ${state === 'done' ? 'text-gray-400' : 'text-gray-900'}`}>
                    {m.company}
                    {m.position && <span className={`font-normal ${state === 'done' ? 'text-gray-400' : 'text-gray-500'}`}> · {m.position}</span>}
                  </p>

                  {/* Interview detail (who / what) */}
                  {note && (
                    <p className="text-[11.5px] text-gray-500 mt-0.5 leading-snug truncate">👤 {note}</p>
                  )}
                </div>

                {/* Join button — compact, content-sized */}
                {m.meetingLink && state !== 'done' && (
                  <a href={m.meetingLink} target="_blank" rel="noopener noreferrer"
                    onClick={() => { if (m.job) onJoin?.(m.job) }}
                    title={platform ? t('upcomingMeetings.joinVia').replace('{platform}', platform.name) : t('upcomingMeetings.join')}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all ${accent.btn}`}
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
