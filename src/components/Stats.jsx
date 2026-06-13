import { useMemo, useState } from 'react'
import { STATUSES } from '../hooks/useJobs'

function ActivityBars({ values, color = '#6366f1' }) {
  if (!values || values.length !== 7) return null
  const max = Math.max(...values, 1)
  const days = ['L','M','M','J','V','S','D']

  return (
    <div className="flex items-end justify-center h-40 gap-2">
      {values.map((v, i) => {
        const pct = (v / max) * 100
        return (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="flex items-end justify-center h-32 w-8 bg-gray-50 rounded">
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${pct}%`,
                  background: color,
                  opacity: 0.8
                }}
              />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs font-semibold text-gray-700">{v}</span>
              <span className="text-[10px] text-gray-400">{days[i]}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RadialProgress({ value, max = 100, size = 80, color = '#6366f1', label }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const dash = pct * circ
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>{label}</span>
    </div>
  )
}

function Card({ children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col p-5 gap-3">
      {children}
    </div>
  )
}

export default function Stats({ jobs, t = (key) => key }) {
  const total = jobs.filter(j => j.status !== 'archived').length
  const active = jobs.filter(j => ['sent','reviewing','interview','waiting'].includes(j.status)).length
  const interviews = jobs.filter(j => j.status === 'interview').length
  const offers = jobs.filter(j => j.status === 'offer').length
  const rejected = jobs.filter(j => ['rejected','rejected_ats'].includes(j.status)).length
  const sent = jobs.filter(j => ['sent','reviewing','interview','waiting','offer','rejected','rejected_ats'].includes(j.status)).length

  const responseRate = total > 0 ? Math.round(((interviews + offers + rejected) / total) * 100) : 0
  const offerRate = total > 0 ? Math.round((offers / total) * 100) : 0
  const interviewRate = total > 0 ? Math.round(((interviews + offers) / total) * 100) : 0

  const getWeekStart = () => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const weekStart = new Date(now.setDate(diff))
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  const weeklyActivity = useMemo(() => {
    const days = Array(7).fill(0)
    const weekStart = getWeekStart()
    for (const j of jobs) {
      const jobDate = new Date(j.date)
      jobDate.setHours(0, 0, 0, 0)
      const diff = Math.floor((jobDate - weekStart) / 86400000)
      if (diff >= 0 && diff < 7) days[diff]++
    }
    return days
  }, [jobs])

  const funnel = [
    { label: t('statsPipeline.sent'),   count: sent,              color: '#3b82f6', bg: 'bg-blue-500' },
    { label: t('statsPipeline.interviews'), count: interviews + offers, color: '#8b5cf6', bg: 'bg-purple-500' },
    { label: t('statsPipeline.offers'),     count: offers,             color: '#10b981', bg: 'bg-green-500' },
  ]

  const byStatus = STATUSES.map(s => ({
    ...s,
    count: jobs.filter(j => j.status === s.key).length
  })).filter(s => s.count > 0 && s.key !== 'archived')

  const weekStart = getWeekStart()
  const thisWeek = jobs.filter(j => new Date(j.date) >= weekStart).length
  const rateColor = responseRate >= 30 ? '#10b981' : responseRate >= 15 ? '#f59e0b' : '#6366f1'

  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-0">
      {/* Mobile toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="sm:hidden flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm w-full text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('statsHeader.title')}</span>
          <span className="text-xs font-bold text-gray-700">{total} {t('statsHeader.summary').split(' · ')[0]} · {responseRate}% {t('statsHeader.summary').split(' · ')[1]} · {thisWeek} {t('statsHeader.summary').split(' · ')[2]}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Grid — always visible on sm+, toggled on mobile */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 sm:mt-0 ${open ? 'block' : 'hidden'} sm:grid`}>

      {/* ── Card 1 — Pipeline ─────────────────────────────────── */}
      <Card>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('statsPipeline.title')}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-extrabold text-gray-800 leading-none">{total}</span>
          <span className="text-sm text-gray-400">{t('statsPipeline.activeApplications')}</span>
        </div>
        <div className="flex flex-col gap-3">
          {funnel.map((f, i) => {
            const pct = funnel[0].count > 0 ? (f.count / funnel[0].count) * 100 : 0
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: f.color }} />
                    <span className="text-xs text-gray-500">{f.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{f.count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: f.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Card 2 — Response Rate ──────────────────────────── */}
      <Card>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('statsResponse.title')}</span>
        <div className="flex items-center gap-4">
          <RadialProgress value={responseRate} max={100} size={80} color={rateColor} label={`${responseRate}%`} />
          <div className="flex-1 flex flex-col gap-2">
            {[
              { label: t('statsResponse.interviews'), value: `${interviewRate}%`, color: '#8b5cf6' },
              { label: t('statsResponse.offers'),     value: `${offerRate}%`,     color: '#10b981' },
              { label: t('statsResponse.active'),   value: active,              color: '#f59e0b' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                <span className="text-xs text-gray-500 flex-1">{row.label}</span>
                <span className="text-sm font-bold text-gray-700">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {[
            { pct: interviewRate, color: '#8b5cf6' },
            { pct: offerRate,     color: '#10b981' },
          ].map((bar, i) => (
            <div key={i} className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${bar.pct}%`, background: bar.color }} />
            </div>
          ))}
          {total < 5 && <p className="text-[10px] text-amber-500">{t('statsResponse.insufficientData')}</p>}
        </div>
      </Card>

      {/* ── Card 3 — 7-Day Activity ──────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('statsActivity.title')}</span>
          <span className="text-[11px] text-indigo-600 font-semibold">{thisWeek} {t('statsActivity.added')}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-extrabold text-indigo-600 leading-none">{thisWeek}</span>
          <span className="text-sm text-gray-400">{t('statsActivity.thisWeek')}</span>
        </div>
        <ActivityBars values={weeklyActivity} color="#6366f1" />
      </Card>

      {/* ── Card 4 — Distribution ──────────────────────────────── */}
      <Card>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('statsDistribution.title')}</span>
        <div className="flex flex-col gap-2.5">
          {byStatus.length === 0 && <span className="text-xs text-gray-300">—</span>}
          {byStatus.map(s => {
            const pct = total > 0 ? (s.count / total) * 100 : 0
            const colorMap = {
              'bg-blue-400': '#60a5fa', 'bg-yellow-400': '#facc15', 'bg-orange-400': '#fb923c',
              'bg-purple-500': '#a855f7', 'bg-green-500': '#22c55e', 'bg-indigo-500': '#6366f1',
              'bg-red-400': '#f87171', 'bg-pink-400': '#f472b6', 'bg-gray-300': '#d1d5db',
              'bg-gray-400': '#9ca3af', 'bg-slate-400': '#94a3b8',
            }
            const barColor = colorMap[s.dot] || '#6366f1'
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: barColor }} />
                <span className="text-xs text-gray-600 w-28 flex-shrink-0">{s.label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden min-w-0">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                <span className="text-sm font-bold text-gray-700 w-6 text-right flex-shrink-0">{s.count}</span>
              </div>
            )
          })}
        </div>
      </Card>

      </div>{/* end grid */}
    </div>
  )
}
