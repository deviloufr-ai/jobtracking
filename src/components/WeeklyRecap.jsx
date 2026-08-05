import { useMemo, useState } from 'react'
import { parseDate, applicationDate, mondayOf, DAY } from '../utils/metrics'
import { getStatusLabel } from '../hooks/useJobs'

// ── Pure aggregation ──────────────────────────────────────────────────────────
// A weekly recap over ONE Monday→Sunday window. "Added" counts candidatures whose
// application date (earliest known date) lands in the window. "Events" are the
// meaningful status changes recorded in each job's timeline during the window —
// the initial todo/sent seeds are ignored so the recap reflects real movement.
const RESPONSE = new Set(['reviewing', 'waiting'])
const OFFERISH = new Set(['offer', 'done'])
const REJECT = new Set(['rejected', 'rejected_ats', 'cancelled'])

export function computeWeeklyRecap(jobs, weekStart) {
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY)
  const inWindow = (d) => {
    const dt = parseDate(d)
    return !!dt && dt >= weekStart && dt < weekEnd
  }

  let added = 0
  let responses = 0, interviews = 0, offers = 0, rejections = 0
  const perDay = Array(7).fill(0) // Mon..Sun
  const addedCompanies = []
  const events = [] // { company, position, status, date, jobId }

  for (const job of jobs) {
    const appDate = applicationDate(job)
    if (appDate && appDate >= weekStart && appDate < weekEnd) {
      added++
      const offset = Math.floor((appDate.getTime() - weekStart.getTime()) / DAY)
      if (offset >= 0 && offset < 7) perDay[offset]++
      addedCompanies.push(job.company)
    }

    for (const h of job.history || []) {
      if (!inWindow(h.date)) continue
      const s = h.status
      if (RESPONSE.has(s)) responses++
      else if (s === 'interview') interviews++
      else if (OFFERISH.has(s)) offers++
      else if (REJECT.has(s)) rejections++
      else continue // todo / sent seeds — not a status change worth surfacing
      events.push({ company: job.company, position: job.position, status: s, date: h.date, jobId: job.id })
    }
  }

  events.sort((a, b) => new Date(b.date) - new Date(a.date))

  return { added, responses, interviews, offers, rejections, perDay, addedCompanies, events, weekStart, weekEnd }
}

// ── Presentation ──────────────────────────────────────────────────────────────
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_LETTERS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const STATUS_DOT = {
  reviewing: '#f59e0b', waiting: '#fb923c', interview: '#8b5cf6',
  offer: '#10b981', done: '#14b8a6', rejected: '#f87171',
  rejected_ats: '#fb7185', cancelled: '#9ca3af',
}

function Delta({ value }) {
  if (value === 0) return <span className="text-[11px] font-medium text-gray-400">±0</span>
  const up = value > 0
  return (
    <span className={`text-[11px] font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}
    </span>
  )
}

function Tile({ label, value, color, delta }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold leading-none" style={{ color }}>{value}</span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <span className="text-[11px] text-gray-500 leading-tight">{label}</span>
    </div>
  )
}

export default function WeeklyRecap({ jobs, t = (k) => k, language = 'en' }) {
  // 0 = current week, -1 = last week, … (never lets you go into the future).
  const [offset, setOffset] = useState(0)

  const thisMonday = useMemo(() => mondayOf(new Date()), [])
  const weekStart = useMemo(
    () => new Date(thisMonday.getTime() + offset * 7 * DAY),
    [thisMonday, offset]
  )

  const recap = useMemo(() => computeWeeklyRecap(jobs, weekStart), [jobs, weekStart])
  const prev = useMemo(
    () => computeWeeklyRecap(jobs, new Date(weekStart.getTime() - 7 * DAY)),
    [jobs, weekStart]
  )

  const dayLetters = language === 'fr' ? DAY_LETTERS : DAY_LETTERS_EN
  const maxDay = Math.max(...recap.perDay, 1)
  const weekEndLabel = new Date(recap.weekEnd.getTime() - DAY)
  const fmt = (d) => d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })
  const rangeLabel =
    offset === 0 ? t('weeklyRecap.thisWeek')
    : offset === -1 ? t('weeklyRecap.lastWeek')
    : `${fmt(weekStart)} – ${fmt(weekEndLabel)}`

  const totalActivity = recap.added + recap.events.length
  const uniqueCompanies = [...new Set(recap.addedCompanies)]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
      {/* Header + week navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('weeklyRecap.title')}</span>
          <span className="text-sm font-bold text-gray-800">
            {rangeLabel}
            <span className="ml-2 font-normal text-xs text-gray-400">{fmt(weekStart)} – {fmt(weekEndLabel)}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset(o => o - 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            aria-label={t('weeklyRecap.prevWeek')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={() => setOffset(o => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label={t('weeklyRecap.nextWeek')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {totalActivity === 0 ? (
        <div className="flex flex-col items-center text-center gap-1.5 py-6">
          <span className="text-2xl">🗓️</span>
          <p className="text-sm text-gray-400 max-w-xs">{t('weeklyRecap.emptyWeek')}</p>
        </div>
      ) : (
        <>
          {/* Metric tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Tile label={t('weeklyRecap.added')} value={recap.added} color="#6366f1" delta={recap.added - prev.added} />
            <Tile label={t('weeklyRecap.responses')} value={recap.responses} color="#f59e0b" delta={recap.responses - prev.responses} />
            <Tile label={t('weeklyRecap.interviews')} value={recap.interviews} color="#8b5cf6" delta={recap.interviews - prev.interviews} />
            <Tile label={t('weeklyRecap.offers')} value={recap.offers} color="#10b981" delta={recap.offers - prev.offers} />
            <Tile label={t('weeklyRecap.rejections')} value={recap.rejections} color="#f87171" delta={recap.rejections - prev.rejections} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Per-day added chart */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('weeklyRecap.appsPerDay')}</span>
              <div className="flex items-end justify-between gap-1.5 h-24 mt-1">
                {recap.perDay.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-gray-600 h-3">{v > 0 ? v : ''}</span>
                    <div className="w-full flex items-end justify-center h-16 bg-gray-50 rounded">
                      <div className="w-full rounded-t transition-all" style={{ height: `${(v / maxDay) * 100}%`, background: '#6366f1', opacity: 0.85, minHeight: v > 0 ? 4 : 0 }} />
                    </div>
                    <span className="text-[10px] text-gray-400">{dayLetters[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status changes list */}
            <div className="flex flex-col gap-2 min-w-0">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('weeklyRecap.statusChanges')}</span>
              {recap.events.length === 0 ? (
                <p className="text-xs text-gray-300 py-2">{t('weeklyRecap.noStatusChanges')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {recap.events.slice(0, 6).map((e, i) => (
                    <div key={`${e.jobId}-${i}`} className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[e.status] || '#9ca3af' }} />
                      <span className="text-xs font-medium text-gray-700 truncate flex-1 min-w-0">{e.company}</span>
                      <span className="text-[11px] text-gray-500 flex-shrink-0">{getStatusLabel(e.status, t)}</span>
                    </div>
                  ))}
                  {recap.events.length > 6 && (
                    <span className="text-[11px] text-gray-400">{t('weeklyRecap.andMore').replace('{count}', recap.events.length - 6)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Companies applied to this week */}
          {uniqueCompanies.length > 0 && (
            <div className="flex flex-col gap-2 pt-1 border-t border-gray-50">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('weeklyRecap.appliedTo')}</span>
              <div className="flex flex-wrap gap-1.5">
                {uniqueCompanies.slice(0, 12).map((c, i) => (
                  <span key={i} className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{c}</span>
                ))}
                {uniqueCompanies.length > 12 && (
                  <span className="text-[11px] text-gray-400 px-1 py-0.5">+{uniqueCompanies.length - 12}</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
