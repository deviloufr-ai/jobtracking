import { useRef, useState, memo, Fragment } from 'react'
import { getStatus, getStatusLabel } from '../hooks/useJobs'
import CompanyAvatar from './CompanyAvatar'
import { ScoreBadge } from './ScoreJob'
import { getJobHealth, HEALTH_DOT_CLASS } from '../utils/jobHealth'

// Width of the swipe-revealed action drawer (two 76px buttons).
const REVEAL = 152

// Collapse a history into milestone nodes: chronological, with consecutive
// same-status entries merged (keeping the latest date). Caps at 4 nodes —
// first + last three when longer — so the strip always fits the card width.
function buildMilestones(history) {
  const dated = (history || []).filter(h => h.date).slice().sort((a, b) => new Date(a.date) - new Date(b.date))
  const nodes = []
  for (const h of dated) {
    const key = h.status || null
    const prev = nodes[nodes.length - 1]
    if (prev && prev.status === key) { prev.date = h.date; continue }
    nodes.push({ status: key, date: h.date })
  }
  return nodes.length > 4 ? [nodes[0], ...nodes.slice(-3)] : nodes
}

// Compact horizontal timeline shown on the flux card — the candidature's
// progression at a glance. Fits the card width (no scroll, so it never fights
// the row's swipe gesture). Renders nothing until there are ≥2 milestones.
function MiniTimeline({ history, fallbackStatus, t }) {
  const nodes = buildMilestones(history)
  if (nodes.length < 2) return null
  const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <div className="flex items-start pt-0.5" aria-hidden="true">
      {nodes.map((n, i) => {
        const st = getStatus(n.status || fallbackStatus)
        const last = i === nodes.length - 1
        return (
          <Fragment key={i}>
            <div className="flex flex-col items-center text-center min-w-0 px-0.5">
              <span className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${st.dot} ${last ? 'shadow-[0_0_0_3px_rgba(99,102,241,0.15)]' : ''}`} />
              <span className="text-[9.5px] font-medium text-gray-500 leading-tight mt-1 truncate max-w-[62px]">{getStatusLabel(n.status || fallbackStatus, t)}</span>
              <span className="text-[9px] text-gray-400 tabular-nums leading-tight">{shortDate(n.date)}</span>
            </div>
            {!last && <div className="flex-1 h-0.5 bg-gray-200 mt-[4px] mx-0.5" />}
          </Fragment>
        )
      })}
    </div>
  )
}

// Localized "x days ago" — mirrors JobCard.relativeTime, kept local so the row
// stays self-contained.
function relTime(d) {
  if (!d) return ''
  const diff = new Date(d) - Date.now()
  const day = 86400000
  const abs = Math.abs(diff)
  try {
    const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto' })
    if (abs < day) return rtf.format(Math.round(diff / 3600000), 'hour')
    if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day')
    if (abs < 365 * day) return rtf.format(Math.round(diff / (30 * day)), 'month')
    return rtf.format(Math.round(diff / (365 * day)), 'year')
  } catch { return '' }
}

/**
 * Flux list row — the mobile content-first list item. Tap opens the full-screen
 * detail sheet; swipe left reveals quick actions (follow-up / archive). Status
 * derives from the latest timeline entry, matching JobCard and JobRow.
 */
function JobFluxRow({ job, onOpen, onToggleFavorite, onArchive, onRelance, t = (k) => k }) {
  const [dx, setDx] = useState(0)
  const start = useRef({ x: 0, y: 0, base: 0, mode: null })
  const moved = useRef(false)

  const history = job.history || []
  const statusKey = history.length ? (history[history.length - 1].status || job.status) : job.status
  const status = getStatus(statusKey)
  const lastActivity = history.length
    ? history.reduce((latest, h) => (new Date(h.date) > new Date(latest) ? h.date : latest), history[0].date)
    : (job.updatedAt || job.date)
  const health = getJobHealth(job)

  const onTouchStart = (e) => {
    const tch = e.touches[0]
    start.current = { x: tch.clientX, y: tch.clientY, base: dx, mode: null }
    moved.current = false
  }
  const onTouchMove = (e) => {
    const tch = e.touches[0]
    const ddx = tch.clientX - start.current.x
    const ddy = tch.clientY - start.current.y
    if (start.current.mode === null) {
      if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) start.current.mode = 'swipe'
      else if (Math.abs(ddy) > 10) start.current.mode = 'scroll'
    }
    if (start.current.mode === 'swipe') {
      moved.current = true
      let next = start.current.base + ddx
      if (next > 0) next = 0
      if (next < -REVEAL) next = -REVEAL
      setDx(next)
    }
  }
  const onTouchEnd = () => {
    if (start.current.mode === 'swipe') {
      const target = dx < -REVEAL / 2 ? -REVEAL : 0
      start.current.mode = null // re-enable the transition so the snap animates
      setDx(target)
    }
  }
  // A swipe shouldn't also count as a tap; a tap on an open row just closes it.
  const handleClick = () => {
    if (moved.current) { moved.current = false; return }
    if (dx !== 0) { setDx(0); return }
    onOpen?.(job)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe actions (revealed behind the row) */}
      <div className="absolute inset-y-0 right-0 flex">
        <button onClick={() => { setDx(0); onRelance?.(job) }}
          className="w-[76px] flex flex-col items-center justify-center gap-1 bg-blue-500 text-white active:bg-blue-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          <span className="text-[11px] font-medium">{t('flux.relance') === 'flux.relance' ? 'Relancer' : t('flux.relance')}</span>
        </button>
        <button onClick={() => { setDx(0); onArchive?.(job) }}
          className="w-[76px] flex flex-col items-center justify-center gap-1 bg-amber-500 text-white active:bg-amber-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
          <span className="text-[11px] font-medium">{t('flux.archive') === 'flux.archive' ? 'Archiver' : t('flux.archive')}</span>
        </button>
      </div>

      {/* Foreground row */}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={handleClick}
        style={{ transform: `translateX(${dx}px)`, transition: start.current.mode === 'swipe' ? 'none' : 'transform .2s ease', touchAction: 'pan-y' }}
        className={`relative flex flex-col gap-2.5 p-3.5 rounded-2xl border ${
          job.favorite ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
        } ${job.status === 'cancelled' ? 'opacity-50' : ''}`}
      >
        <div className="flex items-center gap-3">
        <CompanyAvatar company={job.company} sizeClass="w-11 h-11" textClass="text-sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {health.level !== 'none' && (
              <span title={health.message} className={`flex-shrink-0 w-2 h-2 rounded-full ${HEALTH_DOT_CLASS[health.level]} ${health.level === 'stale' ? 'animate-pulse' : ''}`} />
            )}
            <span className="font-semibold text-gray-900 text-[15px] truncate">{job.company}</span>
            <ScoreBadge job={job} t={t} />
            {job.cvSaved && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600 flex-shrink-0">CV</span>}
          </div>
          <div className="text-[13px] text-gray-500 truncate">{job.position}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {getStatusLabel(statusKey, t)}
            </span>
            <span className="text-[11px] text-gray-400">{relTime(lastActivity)}</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(job.id) }}
          aria-label="favorite"
          className={`self-start text-xl leading-none transition-all active:scale-125 p-1 -m-1 ${job.favorite ? 'text-yellow-400' : 'text-gray-300'}`}
        >★</button>
        </div>
        <MiniTimeline history={history} fallbackStatus={statusKey} t={t} />
      </div>
    </div>
  )
}

export default memo(JobFluxRow)
