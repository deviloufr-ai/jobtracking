import { useState, useRef, useEffect, memo, Fragment } from 'react'
import { enrichJobTimeline } from '../services/enrichTimeline'
import { STATUSES, getStatus, getStatusLabel } from '../hooks/useJobs'
import { ScoreBadge } from './ScoreJob'
import CompanyAvatar from './CompanyAvatar'
import BottomSheet from './BottomSheet'
import { getJobHealth, HEALTH_DOT_CLASS } from '../utils/jobHealth'

// Sender label for a timeline entry — "You", a recruiter first name, or null.
// Mirrors JobRow.getSourceLabel so mobile and desktop read the same.
function getSourceLabel(entry, companyName, t) {
  if (entry.source === 'calendar') return null
  if (entry.source === 'email') {
    if (entry.fromMe) return t('jobActions.you')
    if (entry.from) {
      const match = entry.from.match(/^([^<]+)/)
      return match ? match[1].trim().split(' ')[0] : entry.from.split('@')[0]
    }
    return companyName
  }
  return null
}

// Shared status/date/time/note mini-form (add a step, or edit one). Kept at
// module scope so its inputs don't remount (and lose focus) on every keystroke.
function StepForm({ value, onChange, onSubmit, onCancel, submitLabel, t }) {
  return (
    <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 space-y-3" onClick={e => e.stopPropagation()}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => onChange({ ...value, status: s.key })}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              value.status === s.key ? s.color + ' border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-500'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {getStatusLabel(s.key, t)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="date" value={value.date} onChange={e => onChange({ ...value, date: e.target.value })}
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <input type="time" value={value.time} onChange={e => onChange({ ...value, time: e.target.value })}
          className="w-28 text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>
      <textarea value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} rows={2}
        placeholder={t('jobActions.notes')}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={!value.note.trim()}
          className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-40">
          {submitLabel}
        </button>
        <button onClick={onCancel}
          className="px-4 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          {t('common.cancel') || 'Annuler'}
        </button>
      </div>
    </div>
  )
}

// 3-step funnel position for the progress stepper, derived from the effective
// status. undefined → no stepper (todo or a terminal/negative status).
const STEP_REACHED = { sent: 0, reviewing: 0, waiting: 0, interview: 1, done: 1, offer: 2 }

function JobCard({ job, onEdit, onDelete, onStatusChange, onAddStep, onUpdateHistory, onUpdateJob, onGenerateCV, onToggleFavorite, onViewSavedCV, forceExpand, onForceExpandDone, checkAllPositions, variant = 'card', defaultExpanded = false, t = (key) => key }) {
  const isSheet = variant === 'sheet'
  const [expanded, setExpanded] = useState(defaultExpanded)
  const px = isSheet ? 'px-1' : 'px-3.5'
  const [statusSheet, setStatusSheet] = useState(false)
  const [actionsSheet, setActionsSheet] = useState(false)
  const [descSheet, setDescSheet] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [editingIdx, setEditingIdx] = useState(null)      // display index of step being edited
  const [editForm, setEditForm] = useState({})
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)
  const rowRef = useRef(null)
  const enrichTimerRef = useRef(null)

  const history = job.history || []
  // Job description text — the field name differs across import paths
  // (JobModal saves `description`, scoring/imports use `jobDescription`).
  const jobDescription = (job.jobDescription || job.description || '').trim()

  // Status derives from the latest history entry, falling back to job.status.
  const displayStatusKey = history.length ? (history[history.length - 1].status || job.status) : job.status
  const status = getStatus(displayStatusKey)

  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const [newStep, setNewStep] = useState({
    status: displayStatusKey,
    note: '',
    date: now.toISOString().split('T')[0],
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  })

  const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const hasTime = (d) => typeof d === 'string' && d.includes('T')
  const formatEntry = (d) => {
    if (!d) return '—'
    if (!hasTime(d)) return formatDate(d)
    const date = new Date(d)
    return `${date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  }

  // Localized "x days ago" for the card header — adds a sense of recency.
  const relativeTime = (d) => {
    if (!d) return ''
    const diffMs = new Date(d) - Date.now()
    const day = 86400000
    const abs = Math.abs(diffMs)
    try {
      const rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto' })
      if (abs < day) return rtf.format(Math.round(diffMs / 3600000), 'hour')
      if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day')
      if (abs < 365 * day) return rtf.format(Math.round(diffMs / (30 * day)), 'month')
      return rtf.format(Math.round(diffMs / (365 * day)), 'year')
    } catch { return formatDate(d) }
  }

  // Last activity = latest entry by timestamp, else the application date.
  const lastActivity = history.length
    ? history.reduce((latest, h) => (new Date(h.date) > new Date(latest) ? h.date : latest), history[0].date)
    : (job.updatedAt || job.date)
  const noteText = history.length ? history[history.length - 1].note : job.notes
  const emailCount = history.filter(h => h.source === 'email').length

  // Earliest date each funnel stage was reached — shown under the progress
  // stepper. Uses the min date per step so it holds even if history isn't sorted.
  const stepDates = (() => {
    const dates = [null, null, null]
    for (const h of history) {
      const si = STEP_REACHED[h.status]
      if (si === undefined || !h.date) continue
      if (dates[si] == null || new Date(h.date) < new Date(dates[si])) dates[si] = h.date
    }
    return dates
  })()
  const stepDateLabel = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')

  // Open + scroll when triggered from "Next steps"
  useEffect(() => {
    if (!forceExpand) return
    setExpanded(true)
    setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    onForceExpandDone?.()
  }, [forceExpand]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current) }, [])

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
      } else {
        setEnrichResult({ success: true, count: 0 })
      }
    } catch (e) {
      setEnrichResult({ success: false })
    }
    setEnriching(false)
    enrichTimerRef.current = setTimeout(() => setEnrichResult(null), 3000)
  }

  // History renders reversed (newest first) — convert display idx → array idx.
  const toOriginalIdx = (displayIdx) => history.length - 1 - displayIdx

  const submitAddStep = () => {
    if (!newStep.note.trim()) return
    onAddStep(job.id, {
      ...newStep,
      date: newStep.time ? `${newStep.date}T${newStep.time}:00` : newStep.date,
    })
    const n = new Date()
    setNewStep({ status: displayStatusKey, note: '', date: n.toISOString().split('T')[0], time: `${pad(n.getHours())}:${pad(n.getMinutes())}` })
    setShowAddStep(false)
  }

  const startEdit = (displayIdx) => {
    const idx = toOriginalIdx(displayIdx)
    const entry = history[idx]
    const d = entry.date || ''
    setEditForm({
      status: entry.status || displayStatusKey,
      note: entry.note || '',
      date: d.split('T')[0],
      time: d.includes('T') ? d.split('T')[1].slice(0, 5) : '',
    })
    setEditingIdx(displayIdx)
  }

  const saveEdit = () => {
    const idx = toOriginalIdx(editingIdx)
    const merged = {
      ...history[idx],
      status: editForm.status,
      note: editForm.note,
      date: editForm.time ? `${editForm.date}T${editForm.time}:00` : editForm.date,
    }
    if (merged.status === 'interview' && new Date(merged.date) < new Date()) merged.status = 'done'
    const updated = [...history]
    updated[idx] = merged
    onUpdateHistory(job.id, [...updated].sort((a, b) => new Date(a.date) - new Date(b.date)))
    setEditingIdx(null)
    setEditForm({})
  }

  const deleteStep = (displayIdx) => {
    const idx = toOriginalIdx(displayIdx)
    onUpdateHistory(job.id, history.filter((_, i) => i !== idx))
    setConfirmDeleteIdx(null)
  }

  const actionBtn = 'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors text-left'

  return (
    <div
      ref={rowRef}
      className={isSheet
        ? 'bg-transparent'
        : `rounded-2xl border transition-all ${
            job.favorite ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-gray-200'
          } ${job.status === 'cancelled' ? 'opacity-50' : ''} ${expanded ? 'shadow-md' : 'shadow-sm'}`}
    >
      {/* ── Header (tap to expand on cards; static in the detail sheet) ─────── */}
      <div className={`flex items-start gap-3 ${px} py-3.5 ${isSheet ? '' : 'cursor-pointer'}`} onClick={() => { if (!isSheet) setExpanded(v => !v) }}>
        <CompanyAvatar company={job.company} sizeClass="w-11 h-11" textClass="text-sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {(() => {
              const health = getJobHealth(job)
              if (health.level === 'none') return null
              return (
                <span
                  title={health.message}
                  className={`flex-shrink-0 w-2 h-2 rounded-full ${HEALTH_DOT_CLASS[health.level]} ${health.level === 'stale' ? 'animate-pulse' : ''}`}
                />
              )
            })()}
            <span className="font-semibold text-gray-900 text-[15px] truncate">{job.company}</span>
            <ScoreBadge job={job} t={t} />
            {job.cvSaved && (
              <button
                onClick={e => { e.stopPropagation(); onViewSavedCV?.(job) }}
                title={t('jobCard.viewCV') || 'View CV'}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600 flex-shrink-0 active:scale-95 transition-transform"
              >CV</button>
            )}
          </div>
          <div className="text-[13px] text-gray-500 truncate">{job.position}</div>

          {/* Status pill + meta */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={e => { e.stopPropagation(); setStatusSheet(true) }}
              className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-xs font-semibold ${status.color} active:scale-95 transition-transform`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {getStatusLabel(displayStatusKey, t)}
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <span className="text-[11px] text-gray-400">{relativeTime(lastActivity)}</span>
            {emailCount > 0 && <span className="text-[11px] text-gray-400">· ✉️ {emailCount}</span>}
          </div>
        </div>

        {/* Favorite + chevron */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite?.(job.id) }}
            className={`text-xl leading-none transition-all active:scale-125 ${job.favorite ? 'text-yellow-400' : 'text-gray-300'}`}
          >★</button>
          {!isSheet && (
            <svg className={`w-4 h-4 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {/* Collapsed note preview */}
      {!expanded && noteText && (
        <p className={`${px} pb-3.5 -mt-1 text-xs text-gray-500 line-clamp-2`}>{noteText}</p>
      )}

      {/* ── Expanded body ──────────────────────────────────────────────────── */}
      {expanded && (
        <div className={`${px} pb-3.5 animate-expand`}>
          {/* Progress stepper — funnel position at a glance */}
          {STEP_REACHED[displayStatusKey] !== undefined && (
            <div className="flex items-start mb-4 px-1">
              {[getStatusLabel('sent', t), getStatusLabel('interview', t), getStatusLabel('offer', t)].map((label, i) => {
                const reached = STEP_REACHED[displayStatusKey]
                return (
                  <Fragment key={i}>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className={`w-3 h-3 rounded-full ${i <= reached ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                      <span className={`text-[10px] leading-tight ${i <= reached ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>{label}</span>
                      {stepDates[i] && <span className="text-[10px] leading-tight text-gray-400 tabular-nums">{stepDateLabel(stepDates[i])}</span>}
                    </div>
                    {i < 2 && <div className={`flex-1 h-0.5 mt-[5px] mx-1 ${i < reached ? 'bg-indigo-500' : 'bg-gray-200'}`} />}
                  </Fragment>
                )
              })}
            </div>
          )}
          {/* Meta chips */}
          {(job.location || job.salaryMin || job.salaryMax) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {job.location && <span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">📍 {job.location}</span>}
              {(job.salaryMin || job.salaryMax) && (
                <span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                  💰 {job.salaryMin ? `${job.salaryMin}€` : ''}{job.salaryMax ? `–${job.salaryMax}€` : ''}
                </span>
              )}
            </div>
          )}

          {/* Quick view: tailored CV + job description */}
          {(job.cvSaved || jobDescription) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {job.cvSaved && (
                <button
                  onClick={() => onViewSavedCV?.(job)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 active:scale-95 transition-all"
                >
                  📄 {t('jobCard.viewCV') || 'View CV'}
                </button>
              )}
              {jobDescription && (
                <button
                  onClick={() => setDescSheet(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-700 bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 active:scale-95 transition-all"
                >
                  📋 {t('jobCard.jobDescription') || 'Job description'}
                </button>
              )}
            </div>
          )}

          {/* Timeline */}
          {history.length > 0 ? (
            <div className="relative pl-4 ml-1 border-l-2 border-gray-100 space-y-3">
              {history.slice().reverse().map((entry, displayIdx) => {
                const st = getStatus(entry.status || displayStatusKey)
                const sender = getSourceLabel(entry, job.company, t)
                if (editingIdx === displayIdx) {
                  return (
                    <div key={displayIdx} className="relative">
                      <span className="absolute -left-[1.42rem] top-1.5 w-3 h-3 rounded-full ring-2 ring-white bg-indigo-400" />
                      <StepForm value={editForm} onChange={setEditForm} onSubmit={saveEdit} onCancel={() => setEditingIdx(null)} submitLabel={t('common.save') || 'Enregistrer'} t={t} />
                    </div>
                  )
                }
                return (
                  <div key={displayIdx} className="relative group">
                    <span className={`absolute -left-[1.42rem] top-1.5 w-3 h-3 rounded-full ring-2 ring-white ${st.dot}`} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-gray-400">{formatEntry(entry.date)}</span>
                      {entry.source === 'calendar' && <span className="text-[10px]">📅</span>}
                      {sender && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{sender}</span>}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>
                        <span className={`w-1 h-1 rounded-full ${st.dot}`} />{getStatusLabel(entry.status || displayStatusKey, t)}
                      </span>
                      {/* per-entry edit/delete */}
                      <span className="ml-auto flex items-center gap-1">
                        {confirmDeleteIdx === displayIdx ? (
                          <>
                            <button onClick={() => deleteStep(displayIdx)} className="text-xs font-semibold text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50">✓</button>
                            <button onClick={() => setConfirmDeleteIdx(null)} className="text-xs text-gray-400 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(displayIdx)} aria-label={t('jobCard.edit')} className="text-gray-300 hover:text-indigo-600 p-2.5 -m-1 rounded-lg">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => setConfirmDeleteIdx(displayIdx)} aria-label={t('jobCard.delete')} className="text-gray-300 hover:text-red-600 p-2.5 -m-1 rounded-lg">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    {entry.note && <p className="text-[13px] text-gray-700 mt-0.5 leading-snug">{entry.note}</p>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-3">{t('jobCard.noTimeline') || 'Aucune étape pour le moment'}</p>
          )}

          {/* Add step form / button */}
          {showAddStep ? (
            <div className="mt-3">
              <StepForm value={newStep} onChange={setNewStep} onSubmit={submitAddStep} onCancel={() => setShowAddStep(false)} submitLabel={t('jobCard.addStep')} t={t} />
            </div>
          ) : (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowAddStep(true)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                {t('jobCard.addStep')}
              </button>
              <button
                onClick={() => setActionsSheet(true)}
                className="px-3.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
                aria-label={t('jobActions.steps')}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 12a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0zm6 2a2 2 0 100-4 2 2 0 000 4z" /></svg>
              </button>
            </div>
          )}

          {enrichResult && (
            <p className={`text-xs text-center mt-2 ${enrichResult.success ? 'text-green-600' : 'text-gray-400'}`}>
              {enrichResult.success ? (enrichResult.count > 0 ? `✓ +${enrichResult.count}` : '✓') : '—'}
            </p>
          )}
        </div>
      )}

      {/* ── Status sheet ───────────────────────────────────────────────────── */}
      <BottomSheet open={statusSheet} onClose={() => setStatusSheet(false)} title={t('jobActions.status')} subtitle={job.company}>
        <div className="space-y-1">
          {STATUSES.map(s => (
            <button key={s.key}
              onClick={() => { onStatusChange(job.id, s.key); setStatusSheet(false) }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${s.key === displayStatusKey ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
              <span className={`text-sm ${s.key === displayStatusKey ? 'font-semibold text-indigo-700' : 'text-gray-700'}`}>{getStatusLabel(s.key, t)}</span>
              {s.key === displayStatusKey && <span className="ml-auto text-indigo-600">✓</span>}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* ── Actions sheet ──────────────────────────────────────────────────── */}
      <BottomSheet open={actionsSheet} onClose={() => setActionsSheet(false)} title={job.company} subtitle={job.position}>
        <div className="space-y-1">
          <button onClick={() => { setActionsSheet(false); handleEnrich() }} disabled={enriching}
            className={`${actionBtn} text-cyan-700 hover:bg-cyan-50 disabled:opacity-50`}>
            <span className="text-lg">🔄</span><span>{t('jobCard.sync')}</span>
          </button>
          <button onClick={() => { setActionsSheet(false); onEdit(job) }} className={`${actionBtn} text-gray-700 hover:bg-gray-50`}>
            <span className="text-lg">✏️</span><span>{t('jobCard.edit')}</span>
          </button>
          {onGenerateCV && (
            <button onClick={() => { setActionsSheet(false); onGenerateCV(job) }} className={`${actionBtn} text-indigo-700 hover:bg-indigo-50`}>
              <span className="text-lg">📄</span><span>{t('cvManagerUI.generateCV') || 'Générer un CV'}</span>
            </button>
          )}
          <button onClick={() => { setActionsSheet(false); onDelete(job) }} className={`${actionBtn} text-red-600 hover:bg-red-50`}>
            <span className="text-lg">🗑️</span><span>{t('jobCard.delete')}</span>
          </button>
        </div>
      </BottomSheet>

      {/* ── Job description sheet ──────────────────────────────────────────── */}
      <BottomSheet open={descSheet} onClose={() => setDescSheet(false)} title={t('jobCard.jobDescription') || 'Job description'} subtitle={`${job.company} · ${job.position}`}>
        {jobDescription ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{jobDescription}</p>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">{t('jobCard.noDescription') || 'No job description saved for this application.'}</p>
        )}
      </BottomSheet>
    </div>
  )
}

export default memo(JobCard)
