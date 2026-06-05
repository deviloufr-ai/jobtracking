import { useState, useEffect, useCallback } from 'react'
import { fetchCalendarEvents, isCalendarConnected } from '../services/calendar'

function formatEventTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  // All-day events have no time component
  if (dateStr.length === 10) return ''
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(events) {
  const groups = new Map()
  for (const e of events) {
    if (!groups.has(e.date)) groups.set(e.date, [])
    groups.get(e.date).push(e)
  }
  return groups
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const isSame = (a, b) => a.toDateString() === b.toDateString()
  if (isSame(d, now)) return { label: "Aujourd'hui", urgent: true }
  if (isSame(d, tomorrow)) return { label: 'Demain', urgent: true }
  return {
    label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    urgent: false,
  }
}

const TYPE_COLORS = {
  interview: 'bg-purple-100 text-purple-700 border-purple-200',
  test:      'bg-blue-100 text-blue-700 border-blue-200',
  offer:     'bg-green-100 text-green-700 border-green-200',
  event:     'bg-gray-100 text-gray-600 border-gray-200',
}

const TYPE_LABELS = {
  interview: 'Entretien',
  test:      'Test technique',
  offer:     'Offre',
  event:     'Événement',
}

export default function CalendarWidget() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [months, setMonths] = useState(1)

  const load = useCallback(async () => {
    if (!isCalendarConnected()) return
    setLoading(true)
    setError(null)
    try {
      const raw = await fetchCalendarEvents('', months)
      // Keep only upcoming events
      const today = new Date(); today.setHours(0,0,0,0)
      const upcoming = raw
        .filter(e => e.date && new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
      setEvents(upcoming)
    } catch (e) {
      setError('Impossible de charger le calendrier')
    }
    setLoading(false)
  }, [months])

  useEffect(() => { load() }, [load])

  if (!isCalendarConnected()) return null

  const grouped = groupByDate(events)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        <span className="text-base">🗓️</span>
        <h3 className="text-sm font-semibold text-gray-800">Google Calendar</h3>
        <div className="ml-auto flex items-center gap-1">
          {[1, 3, 6].map(m => (
            <button key={m}
              onClick={() => setMonths(m)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                months === m ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {m}m
            </button>
          ))}
          <button onClick={load} title="Rafraîchir"
            className={`ml-1 text-gray-400 hover:text-indigo-500 transition-colors ${loading ? 'animate-spin' : ''}`}>
            ↻
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[480px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Chargement…
          </div>
        )}

        {!loading && error && (
          <p className="text-xs text-red-500 text-center py-6">{error}</p>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">📭</div>
            <p className="text-xs text-gray-400">Aucun événement à venir sur {months} mois</p>
          </div>
        )}

        {!loading && !error && [...grouped.entries()].map(([date, dayEvents]) => {
          const { label, urgent } = formatDayLabel(date)
          return (
            <div key={date}>
              {/* Day header */}
              <div className={`px-4 py-1.5 text-xs font-semibold sticky top-0 ${
                urgent ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-500'
              }`}>
                {urgent && '⚡ '}{label}
              </div>

              {/* Events for this day */}
              {dayEvents.map((e, i) => {
                const colorClass = TYPE_COLORS[e.type] || TYPE_COLORS.event
                const time = formatEventTime(e.rawStart || e.date)
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-gray-800 font-medium truncate">{e.title}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${colorClass}`}>
                          {TYPE_LABELS[e.type] || 'Événement'}
                        </span>
                      </div>
                      {e.location && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {e.location}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {time && <span className="text-xs text-gray-400">{time}</span>}
                      {e.meetingLink && (
                        <a href={e.meetingLink} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg hover:bg-green-100 transition-colors whitespace-nowrap">
                          Rejoindre
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
