import { useMemo } from 'react'
import { STATUSES } from '../hooks/useJobs'

function Sparkline({ values, color = '#6366f1' }) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values, 1)
  const w = 64, h = 28, pad = 2
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = h - pad - (v / max) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      <circle cx={pts.split(' ').at(-1).split(',')[0]} cy={pts.split(' ').at(-1).split(',')[1]} r="2.5" fill={color} />
    </svg>
  )
}

function RadialProgress({ value, max = 100, size = 56, color = '#6366f1', label }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const dash = pct * circ
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{label}</span>
    </div>
  )
}

export default function Stats({ jobs }) {
  const total = jobs.filter(j => j.status !== 'archived').length
  const active = jobs.filter(j => ['sent','reviewing','interview','waiting'].includes(j.status)).length
  const interviews = jobs.filter(j => j.status === 'interview').length
  const offers = jobs.filter(j => j.status === 'offer').length
  const rejected = jobs.filter(j => ['rejected','rejected_ats'].includes(j.status)).length

  const responseRate = total > 0 ? Math.round(((interviews + offers + rejected) / total) * 100) : 0
  const offerRate = total > 0 ? Math.round((offers / total) * 100) : 0
  const interviewRate = total > 0 ? Math.round(((interviews + offers) / total) * 100) : 0

  // Weekly activity: jobs added/updated per day (last 7 days)
  const weeklyActivity = useMemo(() => {
    const days = Array(7).fill(0)
    const now = new Date()
    for (const j of jobs) {
      const diff = Math.floor((now - new Date(j.date)) / 86400000)
      if (diff >= 0 && diff < 7) days[6 - diff]++
    }
    return days
  }, [jobs])

  // Funnel data
  const funnel = [
    { label: 'Envoyées',   count: jobs.filter(j => ['sent','reviewing','interview','waiting','offer','rejected','rejected_ats'].includes(j.status)).length, color: 'bg-blue-500' },
    { label: 'Entretiens', count: interviews + offers, color: 'bg-purple-500' },
    { label: 'Offres',     count: offers, color: 'bg-green-500' },
  ]

  const byStatus = STATUSES.map(s => ({
    ...s,
    count: jobs.filter(j => j.status === s.key).length
  })).filter(s => s.count > 0 && s.key !== 'archived')

  const thisWeek = jobs.filter(j => (new Date() - new Date(j.date)) / 86400000 <= 7).length

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

      {/* Card 1 — Pipeline overview */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pipeline</span>
          <span className="text-xs text-gray-400">{thisWeek} cette semaine</span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-gray-800 leading-none">{total}</span>
          <span className="text-sm text-gray-400 mb-0.5">candidatures actives</span>
        </div>
        <div className="flex gap-1 mt-1">
          {funnel.map((f, i) => (
            <div key={i} className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400">{f.label}</span>
                <span className="text-[10px] font-bold text-gray-700">{f.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${f.color} rounded-full transition-all`}
                  style={{ width: funnel[0].count > 0 ? `${(f.count / funnel[0].count) * 100}%` : '0%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card 2 — Response rate */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Taux de réponse</span>
        <div className="flex items-center gap-4">
          <RadialProgress value={responseRate} max={100} size={60}
            color={responseRate >= 30 ? '#10b981' : responseRate >= 15 ? '#f59e0b' : '#6366f1'}
            label={`${responseRate}%`} />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
              <span className="text-xs text-gray-500">Entretiens</span>
              <span className="text-xs font-bold text-gray-700 ml-auto">{interviewRate}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-xs text-gray-500">Offres</span>
              <span className="text-xs font-bold text-gray-700 ml-auto">{offerRate}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
              <span className="text-xs text-gray-500">En cours</span>
              <span className="text-xs font-bold text-gray-700 ml-auto">{active}</span>
            </div>
          </div>
        </div>
        {total < 5 && <p className="text-[10px] text-amber-500">⚠ Données insuffisantes</p>}
      </div>

      {/* Card 3 — Weekly activity sparkline */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Activité 7j</span>
          <span className="text-xs text-indigo-600 font-semibold">{thisWeek} ajoutées</span>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <div className="text-3xl font-bold text-indigo-600 leading-none">{thisWeek}</div>
            <div className="text-xs text-gray-400 mt-1">cette semaine</div>
          </div>
          <div className="ml-auto">
            <Sparkline values={weeklyActivity} color="#6366f1" />
            <div className="flex justify-between mt-0.5">
              {['L','M','M','J','V','S','D'].map((d, i) => (
                <span key={i} className="text-[9px] text-gray-300 w-[9px] text-center">{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Card 4 — Status breakdown */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Répartition</span>
        <div className="flex flex-col gap-1.5 flex-1">
          {byStatus.length === 0 && <span className="text-xs text-gray-300 mt-2">—</span>}
          {byStatus.map(s => {
            const pct = total > 0 ? (s.count / total) * 100 : 0
            return (
              <div key={s.key}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-xs text-gray-600">{s.label}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-700">{s.count}</span>
                </div>
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${s.dot.replace('bg-', 'bg-')} rounded-full transition-all`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
