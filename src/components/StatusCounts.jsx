import { useMemo } from 'react'
import { STATUSES, getStatusLabel } from '../hooks/useJobs'

// Statuses that are no longer "in play" — excluded from the ongoing total.
const CLOSED = new Set(['rejected', 'rejected_ats', 'cancelled', 'archived', 'done'])

// Compact per-status count strip shown just above the filter bar. Gives an
// at-a-glance read of how many candidatures sit in each status, headlined by the
// number of ongoing (still-in-play) candidatures. Each pill doubles as a quick
// status filter — it shares filters.statuses with the Filters bar below, so both
// surfaces read the same source of truth and their active states stay in sync.
export default function StatusCounts({ jobs, filters, onChange, t = (k) => k }) {
  const { counts, ongoing } = useMemo(() => {
    const counts = {}
    let ongoing = 0
    for (const j of jobs) {
      counts[j.status] = (counts[j.status] || 0) + 1
      if (!CLOSED.has(j.status)) ongoing++
    }
    return { counts, ongoing }
  }, [jobs])

  // Only render statuses that actually have candidatures, in canonical order.
  const visible = STATUSES.filter(s => counts[s.key] > 0)
  if (visible.length === 0) return null

  const statuses = filters?.statuses || {}
  // Same tri-state cycle as the Filters bar: undefined → include → exclude → undefined
  const cycle = (key) => {
    if (!onChange) return
    const current = statuses[key]
    const next = { ...statuses }
    if (!current) next[key] = 'include'
    else if (current === 'include') next[key] = 'exclude'
    else delete next[key]
    onChange({ ...filters, statuses: next })
  }

  return (
    <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
      {/* Ongoing total — the headline number */}
      <div className="flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 flex-shrink-0">
        <span className="text-lg font-extrabold text-indigo-700 tabular-nums leading-none">{ongoing}</span>
        <span className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide">{t('statusCounts.ongoing')}</span>
      </div>
      <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
      {/* Per-status counts */}
      {visible.map(s => {
        const state = statuses[s.key]
        const label = getStatusLabel(s.key, t)
        return (
          <button
            key={s.key}
            onClick={() => cycle(s.key)}
            title={label}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap flex-shrink-0
              ${state === 'include'
                ? s.color + ' border-transparent shadow-sm'
                : state === 'exclude'
                ? 'bg-red-50 border-red-200 text-red-400 line-through opacity-60'
                : 'bg-white border-gray-100 text-gray-600 hover:border-gray-300'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${state === 'exclude' ? 'bg-red-300' : s.dot}`} />
            <span>{label}</span>
            <span className="font-bold tabular-nums">{counts[s.key]}</span>
          </button>
        )
      })}
    </div>
  )
}
