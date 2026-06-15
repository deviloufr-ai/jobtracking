import { useMemo } from 'react'

// ── Pure aggregation ──────────────────────────────────────────────────────────
// Stage progression used for funnel + "furthest stage reached". Terminal states
// (rejected/cancelled/archived) rank 0 on their own — a job that was interviewed
// then rejected still counts as having reached "interview" because updateStatus
// records a dated history entry with status on every transition.
const STAGE_RANK = { todo: 0, sent: 1, reviewing: 2, waiting: 2, interview: 3, offer: 4, done: 5 }
const RESPONSE_STATUSES = new Set(['reviewing', 'waiting', 'interview', 'offer', 'done', 'rejected', 'rejected_ats'])

function maxStageReached(job) {
  let max = STAGE_RANK[job.status] ?? 0
  for (const h of job.history || []) {
    const r = STAGE_RANK[h.status] ?? 0
    if (r > max) max = r
  }
  return max
}

function hasResponse(job) {
  if (RESPONSE_STATUSES.has(job.status)) return true
  if (maxStageReached(job) >= 2) return true
  return (job.history || []).some(h => RESPONSE_STATUSES.has(h.status))
}

function parseDate(d) {
  if (!d) return null
  const dt = new Date(d)
  return isNaN(dt) ? null : dt
}

function applicationDate(job) {
  const dates = [job.date, ...(job.history || []).map(h => h.date)]
    .map(parseDate)
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

function interviewDate(job) {
  const dates = (job.history || [])
    .filter(h => h.status === 'interview')
    .map(h => parseDate(h.date))
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

const DAY = 86400000

export function computeAnalytics(jobs, weeks = 12) {
  const applied = jobs.filter(j => j.status !== 'todo')
  const total = applied.length

  const responded = applied.filter(hasResponse).length
  const reachedReviewing = applied.filter(j => maxStageReached(j) >= 2).length
  const reachedInterview = applied.filter(j => maxStageReached(j) >= 3).length
  const reachedOffer = applied.filter(j => maxStageReached(j) >= 4).length

  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0
  const interviewRate = total > 0 ? Math.round((reachedInterview / total) * 100) : 0

  // Avg time-to-interview (days) over jobs with a determinable interview date.
  const ttiSamples = []
  for (const j of applied) {
    const start = applicationDate(j)
    const iv = interviewDate(j)
    if (start && iv) {
      const days = Math.round((iv.getTime() - start.getTime()) / DAY)
      if (days >= 0) ttiSamples.push(days)
    }
  }
  const avgTimeToInterview = ttiSamples.length
    ? Math.round(ttiSamples.reduce((a, b) => a + b, 0) / ttiSamples.length)
    : null

  // Applications per week — last `weeks` weeks, Monday-based, including empties.
  const thisMonday = mondayOf(new Date())
  const buckets = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday.getTime() - i * 7 * DAY)
    buckets.push({ start, count: 0 })
  }
  const firstStart = buckets[0].start.getTime()
  for (const j of applied) {
    const d = applicationDate(j)
    if (!d) continue
    const idx = Math.floor((mondayOf(d).getTime() - firstStart) / (7 * DAY))
    if (idx >= 0 && idx < buckets.length) buckets[idx].count++
  }

  const funnel = [
    { key: 'sent', count: total },
    { key: 'reviewing', count: reachedReviewing },
    { key: 'interview', count: reachedInterview },
    { key: 'offer', count: reachedOffer },
  ]

  return {
    total,
    responseRate,
    responded,
    interviewRate,
    reachedInterview,
    reachedOffer,
    avgTimeToInterview,
    ttiCount: ttiSamples.length,
    funnel,
    weekly: buckets,
  }
}

// ── Presentational helpers ─────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col p-5 gap-3 ${className}`}>
      {children}
    </div>
  )
}

function MetricCard({ label, value, suffix, hint, color = '#6366f1' }) {
  return (
    <Card>
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold leading-none" style={{ color }}>{value}</span>
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </Card>
  )
}

const FUNNEL_COLORS = { sent: '#3b82f6', reviewing: '#f59e0b', interview: '#8b5cf6', offer: '#10b981' }

export default function Analytics({ jobs, t = (k) => k }) {
  const a = useMemo(() => computeAnalytics(jobs), [jobs])

  const funnelLabel = (key) => t(`analytics.funnel.${key}`)
  const maxWeekly = Math.max(...a.weekly.map(w => w.count), 1)

  if (a.total === 0) {
    return (
      <Card className="items-center text-center py-12">
        <span className="text-3xl">📊</span>
        <p className="text-sm text-gray-500 max-w-sm">{t('analytics.empty')}</p>
      </Card>
    )
  }

  const fmtWeek = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <div className="flex flex-col gap-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={t('analytics.metrics.totalApps')} value={a.total} color="#374151" />
        <MetricCard
          label={t('analytics.metrics.responseRate')}
          value={`${a.responseRate}%`}
          hint={`${a.responded}/${a.total}`}
          color={a.responseRate >= 30 ? '#10b981' : a.responseRate >= 15 ? '#f59e0b' : '#6366f1'}
        />
        <MetricCard
          label={t('analytics.metrics.avgTimeToInterview')}
          value={a.avgTimeToInterview ?? '—'}
          suffix={a.avgTimeToInterview != null ? t('analytics.metrics.days') : ''}
          hint={a.ttiCount ? `n=${a.ttiCount}` : t('analytics.metrics.noData')}
          color="#8b5cf6"
        />
        <MetricCard
          label={t('analytics.metrics.interviewRate')}
          value={`${a.interviewRate}%`}
          hint={`${a.reachedInterview}/${a.total}`}
          color="#8b5cf6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('analytics.funnel.title')}</span>
          <div className="flex flex-col gap-4 mt-1">
            {a.funnel.map((f, i) => {
              const pct = a.funnel[0].count > 0 ? (f.count / a.funnel[0].count) * 100 : 0
              const prev = i > 0 ? a.funnel[i - 1].count : null
              const conv = prev != null && prev > 0 ? Math.round((f.count / prev) * 100) : null
              const color = FUNNEL_COLORS[f.key]
              return (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs text-gray-500">{funnelLabel(f.key)}</span>
                      {conv != null && (
                        <span className="text-[10px] text-gray-400">↳ {conv}%</span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-gray-700">{f.count}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Applications / week trend */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('analytics.trend.title')}</span>
            <span className="text-[11px] text-gray-400">{t('analytics.trend.subtitle')}</span>
          </div>
          <div className="flex items-end gap-1.5 h-40 mt-2">
            {a.weekly.map((w, i) => {
              const pct = (w.count / maxWeekly) * 100
              const showLabel = i % 2 === 0 || i === a.weekly.length - 1
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${fmtWeek(w.start)} — ${w.count}`}>
                  <span className="text-[10px] font-semibold text-gray-600 h-3">{w.count > 0 ? w.count : ''}</span>
                  <div className="w-full flex items-end justify-center h-28 bg-gray-50 rounded">
                    <div className="w-full rounded-t transition-all" style={{ height: `${pct}%`, background: '#6366f1', opacity: 0.85, minHeight: w.count > 0 ? 4 : 0 }} />
                  </div>
                  <span className="text-[9px] text-gray-400 truncate w-full text-center">{showLabel ? fmtWeek(w.start) : ''}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
