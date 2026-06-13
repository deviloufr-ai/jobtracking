import { useState, useRef, useEffect } from 'react'
import { enrichJobTimeline } from '../services/enrichTimeline'
import { STATUSES, getStatus } from '../hooks/useJobs'
import RowActions from './RowActions'

function JobCard({ job, onEdit, onDelete, onStatusChange, onAddStep, onUpdateHistory, onUpdateJob, onGenerateCV, onToggleFavorite, forceExpand, onForceExpandDone, checkAllPositions, t = (key) => key }) {
  const [expanded, setExpanded] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [checkingPosition, setCheckingPosition] = useState(false)
  const rowRef = useRef(null)
  const enrichTimerRef = useRef(null)
  const [enrichResult, setEnrichResult] = useState(null)

  const status = getStatus(job.status)
  const avatarColors = [
    'bg-violet-100 text-violet-700','bg-blue-100 text-blue-700','bg-teal-100 text-teal-700',
    'bg-orange-100 text-orange-700','bg-pink-100 text-pink-700','bg-cyan-100 text-cyan-700',
    'bg-lime-100 text-lime-700','bg-amber-100 text-amber-700','bg-indigo-100 text-indigo-700',
  ]
  const avatarColor = avatarColors[job.company.charCodeAt(0) % avatarColors.length]
  const initials = job.company.split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase()).join('')

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const handleEnrich = async () => {
    setEnriching(true)
    setEnrichResult(null)
    const syncStartTime = new Date().toISOString()
    try {
      const result = await enrichJobTimeline(job, { calendarOnly: false })
      if (result && result.newCount > 0) {
        onUpdateHistory(job.id, result.history)
        onUpdateJob?.(job.id, { lastSyncTime: syncStartTime })
        setEnrichResult({ success: true, count: result.newCount })
        enrichTimerRef.current = setTimeout(() => setEnrichResult(null), 3000)
      }
    } catch (e) {
      setEnrichResult({ success: false, error: e.message })
      enrichTimerRef.current = setTimeout(() => setEnrichResult(null), 3000)
    }
    setEnriching(false)
  }

  const handleCheckPosition = async () => {
    if (!checkAllPositions || !job.positionLinks?.length) return
    setCheckingPosition(true)
    try {
      await checkAllPositions(job.id, 1)
    } catch (e) {
      console.error('Position check failed:', e.message)
    }
    setCheckingPosition(false)
  }

  const getPositionStatus = () => {
    if (!job.positionChecks || !job.positionLinks?.length) return null
    const checks = Object.values(job.positionChecks).filter(c => c)
    if (!checks.length) return null
    const latest = checks[0]
    return latest.available
  }

  useEffect(() => {
    if (!forceExpand) return
    setExpanded(true)
    setTimeout(() => {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    onForceExpandDone?.()
  }, [forceExpand])

  useEffect(() => () => { if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current) }, [])

  const lastEntry = job.history?.length ? job.history[job.history.length - 1].date : null
  const lastDate = lastEntry || job.updatedAt || job.date
  const noteText = job.history?.length ? job.history[job.history.length - 1].note : job.notes

  return (
    <div
      ref={rowRef}
      className={`rounded-xl border p-3.5 transition-all cursor-pointer ${
        job.favorite
          ? 'bg-amber-50 border-amber-200'
          : 'bg-white border-gray-200 hover:border-indigo-200'
      } ${job.status === 'cancelled' ? 'opacity-40' : ''}`}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Header: Avatar, Company/Position, Status Badge */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar + Favorite */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(job.id) }}
            className={`text-lg leading-none transition-all ${job.favorite ? 'text-yellow-400' : 'text-gray-200 hover:text-yellow-300'}`}
          >★</button>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${avatarColor}`}>
            {initials}
          </div>
        </div>

        {/* Company, Position, Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 text-sm truncate flex items-center gap-1.5">
                {job.company}
                {job.cvSaved && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600 flex-shrink-0">CV</span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate">{job.position}</div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); setShowStatusMenu(v => !v) }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap ${status.color} hover:opacity-80 transition-opacity`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
              <span className="text-xs opacity-60">▾</span>
            </button>
            <span className="text-xs text-gray-400">{formatDate(lastDate)}</span>
          </div>

          {/* Status Menu */}
          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute top-full mt-1 left-0 z-[200] bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[180px]">
                {STATUSES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => { onStatusChange(job.id, s.key); setShowStatusMenu(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left ${s.key === job.status ? 'font-semibold' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                    {s.key === job.status && <span className="ml-auto text-indigo-500">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notes preview */}
      {noteText && (
        <div className="mb-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs text-gray-600 line-clamp-2">{noteText}</p>
        </div>
      )}

      {/* Enrich result */}
      {enrichResult && (
        <div className={`mb-2 text-xs px-2 py-1 rounded-full inline-block ${enrichResult.success ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {enrichResult.success ? `✓ +${enrichResult.count}` : '—'}
        </div>
      )}

      {/* Expand indicator */}
      <div className="flex justify-center mb-2">
        <svg className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      {/* Action buttons - always visible on card */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={e => { e.stopPropagation(); onAddStep(job.id) }}
          className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium flex-1 min-w-[100px]"
          title={t('jobCard.addStep')}
        >
          ➕ {t('jobCard.addStep')}
        </button>
        <button
          onClick={e => { e.stopPropagation(); handleEnrich() }}
          disabled={enriching}
          className="text-xs bg-cyan-50 text-cyan-700 hover:bg-cyan-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50 flex-1 min-w-[100px]"
          title={t('nav.refresh')}
        >
          {enriching ? '⟳' : '🔄'} {t('jobCard.sync')}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onEdit(job) }}
          className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium flex-1 min-w-[80px]"
          title={t('jobCard.edit')}
        >
          ✏️ {t('jobCard.edit')}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(job) }}
          className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium flex-1 min-w-[80px]"
          title={t('jobCard.delete')}
        >
          🗑️
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center mb-3">{t('jobCard.fullDetailsDesktop')}</p>
          <div className="text-xs text-gray-600 space-y-2">
            <p><span className="font-semibold">ID:</span> {job.id.slice(0, 8)}</p>
            {job.salaryMin || job.salaryMax ? (
              <p><span className="font-semibold">Salaire:</span> {job.salaryMin ? `${job.salaryMin}€` : ''} {job.salaryMax ? `- ${job.salaryMax}€` : ''}</p>
            ) : null}
            {job.location && <p><span className="font-semibold">Localisation:</span> {job.location}</p>}
            {job.notes && <p><span className="font-semibold">Notes:</span> {job.notes}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default JobCard
