import { useMemo } from 'react'
import WeeklyRecap from './WeeklyRecap'
import {
  DAY, parseDate, applicationDate, mondayOf,
  maxStageReached, hasResponse, sentJobs, responseRate as computeResponseRate,
} from '../utils/metrics'

// ── Pure aggregation ──────────────────────────────────────────────────────────
// Stage ranking, response detection and the date helpers now come from the shared
// metrics module (utils/metrics). Only the analytics-specific aggregations below
// (time-to-interview, time-in-stage, weekly buckets) live here.

function interviewDate(job) {
  const dates = (job.history || [])
    .filter(h => h.status === 'interview')
    .map(h => parseDate(h.date))
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

// Date a job FIRST entered a given stage. 'sent' = application date (earliest
// known date); other stages = earliest history entry carrying that status.
function firstStageDate(job, stage) {
  if (stage === 'sent') return applicationDate(job)
  const dates = (job.history || [])
    .filter(h => h.status === stage)
    .map(h => parseDate(h.date))
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export function computeAnalytics(jobs, weeks = 12) {
  const applied = sentJobs(jobs)
  const total = applied.length

  const responded = applied.filter(hasResponse).length
  const reachedReviewing = applied.filter(j => maxStageReached(j) >= 2).length
  const reachedInterview = applied.filter(j => maxStageReached(j) >= 3).length
  const reachedOffer = applied.filter(j => maxStageReached(j) >= 4).length

  // Canonical rate from the shared module (identical to responded/total here).
  const responseRate = computeResponseRate(jobs)
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

  // Median time-in-stage: days between FIRST entering one funnel stage and the
  // next. Median (not mean) so a single very slow process doesn't skew it.
  // Keyed by the destination stage for easy lookup beside the funnel bars.
  const STAGE_TRANSITIONS = [['sent', 'reviewing'], ['reviewing', 'interview'], ['interview', 'offer']]
  const stageTimes = STAGE_TRANSITIONS.map(([from, to]) => {
    const samples = []
    for (const j of applied) {
      const a0 = firstStageDate(j, from)
      const b0 = firstStageDate(j, to)
      if (a0 && b0) {
        const days = Math.round((b0.getTime() - a0.getTime()) / DAY)
        if (days >= 0) samples.push(days)
      }
    }
    return { from, to, median: median(samples), n: samples.length }
  })

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
    stageTimes,
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

export default function Analytics({ jobs, t = (k) => k, language = 'en' }) {
  const a = useMemo(() => computeAnalytics(jobs), [jobs])

  const funnelLabel = (key) => t(`analytics.funnel.${key}`)
  const maxWeekly = Math.max(...a.weekly.map(w => w.count), 1)

  if (a.total === 0) {
    return (
      <div className="flex flex-col gap-4">
        <WeeklyRecap jobs={jobs} t={t} language={language} />
        <Card className="items-center text-center py-12">
          <span className="text-3xl">📊</span>
          <p className="text-sm text-gray-500 max-w-sm">{t('analytics.empty')}</p>
        </Card>
      </div>
    )
  }

  const fmtWeek = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <div className="flex flex-col gap-4">
      {/* Weekly recap */}
      <WeeklyRecap jobs={jobs} t={t} language={language} />

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
              // Median days to reach THIS stage from the previous one.
              const stageTime = i > 0 ? a.stageTimes[i - 1] : null
              return (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs text-gray-500">{funnelLabel(f.key)}</span>
                      {conv != null && (
                        <span className="text-[10px] text-gray-400">↳ {conv}%</span>
                      )}
                      {stageTime && stageTime.median != null && (
                        <span className="text-[10px] text-gray-300" title={`n=${stageTime.n}`}>
                          · {t('analytics.funnel.medianDays').replace('{days}', stageTime.median)}
                        </span>
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
          <div className="flex items-end gap-1.5 h-40 mt-4 mb-4 mx-2">
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
