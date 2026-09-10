// InterviewsBoard — dedicated interviews & prep board (nav tab below Applications),
// listing ONLY candidatures that have/had an interview process (hasInterviewProcess).
//
// UX: master · detail. A quiet, scannable list on the left; everything for the
// SELECTED candidature — the interview-round stepper and its training tools —
// lives in one calm detail pane on the right (full-screen on mobile). The tools
// are unchanged (per-round example + mock, STAR, CV, negotiation); they're just
// surfaced one round at a time instead of a wall of controls per row. "Open full
// details" still opens the complete CandidatureDrawer record.
import { useState, useEffect, useMemo } from 'react'
import { getStatus, getStatusLabel, deriveStatusFromHistory, hasInterviewProcess } from '../../hooks/useJobs'
import {
  INTERVIEW_ROUND_META, INTERVIEW_ROUND_ORDER, INTERVIEW_TRAIN_LEVELS,
  jobRoundKeys, jobInterviewRounds, roundLabel, roundPrompt,
} from '../../utils/interviewRounds'
import { scoreColorClasses } from '../ScoreJob'
import UpcomingMeetings from '../UpcomingMeetings'
import MockInterviewChatbot from '../MockInterviewChatbot'
import NegotiationAssistant from '../NegotiationAssistant'
import InterviewExample from '../InterviewExample'
import CandidatureDrawer from './CandidatureDrawer'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')

const SECTION_OF = (status) => {
  if (status === 'offer' || status === 'done') return 'outcome'
  if (status === 'rejected' || status === 'rejected_ats' || status === 'cancelled' || status === 'archived') return 'past'
  return 'active'
}

const scoreOf = (s) => s?.feedback?.score ?? s?.score
const bestMockScore = (sessions = []) =>
  sessions.reduce((m, s) => { const v = scoreOf(s); return typeof v === 'number' && v > m ? v : m }, -1)
const sessionsForRound = (sessions = [], key) => sessions.filter(s => (s.round || null) === key)

// The round to prepare by default for a job: the first level not yet reached
// (i.e. the next one to face), else the last reached, else the first level.
const defaultPrepRound = (job) => {
  const reached = jobRoundKeys(job).filter(k => INTERVIEW_TRAIN_LEVELS.includes(k))
  const next = INTERVIEW_TRAIN_LEVELS.find(k => !reached.includes(k))
  return next || reached[reached.length - 1] || INTERVIEW_TRAIN_LEVELS[0]
}

// A prep-tool as a full card: icon tile + label + one-line description. Larger
// and more inviting than a chip — training is the hero, so its tools read as a
// proper toolkit rather than a strip of tiny buttons.
function ToolCard({ icon, label, desc, onClick, tone = 'gray' }) {
  const tones = {
    gray: 'hover:border-gray-300 hover:bg-gray-50',
    indigo: 'hover:border-indigo-300 hover:bg-indigo-50/60',
    green: 'hover:border-green-300 hover:bg-green-50/60',
  }
  const iconTones = { gray: 'bg-gray-100', indigo: 'bg-indigo-100', green: 'bg-green-100' }
  return (
    <button onClick={onClick} className={`group flex items-start gap-2.5 text-left p-3 rounded-xl border border-gray-200 bg-white transition-colors ${tones[tone]}`}>
      <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-base ${iconTones[tone]}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-gray-900">{label}</span>
        <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">{desc}</span>
      </span>
    </button>
  )
}

// Compact 4-dot round progress shown on a list row.
function RoundDots({ job, t }) {
  const reached = new Set(jobRoundKeys(job))
  return (
    <span className="flex items-center gap-1 shrink-0">
      {INTERVIEW_TRAIN_LEVELS.map(k => (
        <span key={k} title={roundLabel(k, t)} className={`w-1.5 h-1.5 rounded-full ${reached.has(k) ? 'bg-indigo-500' : 'bg-gray-200'}`} />
      ))}
    </span>
  )
}

function InterviewRow({ job, active, onSelect, onToggleFavorite, t }) {
  const effective = deriveStatusFromHistory(job.history) || job.status
  const status = getStatus(effective)
  return (
    <div className={`group flex items-center gap-2.5 pl-2 pr-1 py-2 rounded-xl transition-colors ${active ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-gray-50'}`}>
      <button onClick={() => onSelect(job.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
        {typeof job.score === 'number' ? (
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold border shrink-0 ${scoreColorClasses(job.score)}`}>{job.score}</span>
        ) : (
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: colorFor(job.company) }}>{initials(job.company)}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold tracking-tight text-gray-900 truncate">{job.company}</span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${status?.dot || 'bg-gray-300'}`} />
            <span className="block text-[11.5px] text-gray-400 truncate">{job.position}</span>
          </span>
        </span>
        <RoundDots job={job} t={t} />
      </button>
      <button
        onClick={() => onToggleFavorite?.(job.id)}
        aria-label="favorite" aria-pressed={!!job.favorite}
        className={`shrink-0 text-sm leading-none transition-opacity ${job.favorite ? 'text-amber-400' : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-300'}`}
      >★</button>
    </div>
  )
}

function ListGroup({ title, jobs, accent, collapsible, open, onToggle, selectedId, onSelect, onToggleFavorite, t }) {
  if (jobs.length === 0) return null
  return (
    <div className="mb-2">
      <button
        onClick={collapsible ? onToggle : undefined}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-left ${collapsible ? 'group' : 'cursor-default'}`}
      >
        <span className={`w-1.5 h-3.5 rounded-full ${accent}`} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
        <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{jobs.length}</span>
        {collapsible && <span className={`ml-auto text-gray-300 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>}
      </button>
      {(!collapsible || open) && (
        <div className="space-y-0.5">
          {jobs.map(job => (
            <InterviewRow key={job.id} job={job} active={selectedId === job.id} onSelect={onSelect} onToggleFavorite={onToggleFavorite} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function InterviewList({
  active, outcome, past, selectedId, onSelect, onToggleFavorite,
  roundKeysPresent, roundCounts, roundFilter, setRoundFilter, total,
  archivedCount, showArchived, toggleArchived, t,
}) {
  const [showPast, setShowPast] = useState(false)
  const groupProps = { selectedId, onSelect, onToggleFavorite, t }

  return (
    <div className="md:sticky md:top-2 md:self-start md:max-h-[calc(100vh-1.5rem)] md:overflow-y-auto no-scrollbar">
      {/* Controls */}
      {(roundKeysPresent.length > 0 || archivedCount > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap px-1 pb-2.5 mb-1 border-b border-gray-100">
          {roundKeysPresent.length > 0 && (
            <>
              <button
                onClick={() => setRoundFilter(null)}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${roundFilter === null ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {t('interviews.filterAll')} <span className="opacity-60">{total}</span>
              </button>
              {roundKeysPresent.map(key => {
                const meta = INTERVIEW_ROUND_META[key]
                const on = roundFilter === key
                return (
                  <button key={key} onClick={() => setRoundFilter(on ? null : key)}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${on ? `${meta.color} border-current` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    <span>{meta.icon}</span>{roundLabel(key, t)} <span className="opacity-60">{roundCounts[key]}</span>
                  </button>
                )
              })}
            </>
          )}
          {archivedCount > 0 && (
            <button onClick={toggleArchived}
              className={`ml-auto inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${showArchived ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              <span>🗄️</span>{showArchived ? t('interviews.hideArchived') : t('interviews.showArchived')} <span className="opacity-60">{archivedCount}</span>
            </button>
          )}
        </div>
      )}

      <ListGroup {...groupProps} title={t('interviews.sectionActive')} jobs={active} accent="bg-purple-500" />
      <ListGroup {...groupProps} title={t('interviews.sectionOutcome')} jobs={outcome} accent="bg-green-500" />
      <ListGroup {...groupProps} title={t('interviews.sectionPast')} jobs={past} accent="bg-gray-400" collapsible open={showPast} onToggle={() => setShowPast(v => !v)} />
    </div>
  )
}

// Horizontal round stepper. Reached levels filled + dated; click a node to pick
// the round to prepare (highlighted).
function InterviewStepper({ job, prepRound, onPick, t }) {
  const reached = new Set(jobRoundKeys(job))
  const dateFor = {}
  for (const r of jobInterviewRounds(job)) dateFor[r.key] = r.date // chronological → most recent wins
  return (
    <div className="flex items-start">
      {INTERVIEW_TRAIN_LEVELS.map((k, i) => {
        const isReached = reached.has(k)
        const selected = prepRound === k
        return (
          <div key={k} className="flex-1 flex flex-col items-center min-w-0">
            <div className="relative w-full flex items-center justify-center h-6">
              {i > 0 && <span className={`absolute top-1/2 -translate-y-1/2 left-0 w-1/2 h-0.5 ${isReached || reached.has(INTERVIEW_TRAIN_LEVELS[i - 1]) ? 'bg-indigo-300' : 'bg-gray-200'}`} />}
              {i < INTERVIEW_TRAIN_LEVELS.length - 1 && <span className={`absolute top-1/2 -translate-y-1/2 right-0 w-1/2 h-0.5 ${reached.has(INTERVIEW_TRAIN_LEVELS[i + 1]) && isReached ? 'bg-indigo-300' : 'bg-gray-200'}`} />}
              <button
                onClick={() => onPick(k)}
                aria-pressed={selected}
                title={roundLabel(k, t)}
                className={`relative z-[1] w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-all ${
                  selected ? 'bg-indigo-600 text-white ring-2 ring-indigo-200'
                    : isReached ? 'bg-indigo-500 text-white' : 'bg-white border border-gray-300 text-gray-400 hover:border-indigo-300'
                }`}
              >
                {isReached ? '✓' : i + 1}
              </button>
            </div>
            <button onClick={() => onPick(k)} className={`mt-1 text-[10px] leading-tight text-center truncate w-full px-0.5 ${selected ? 'text-indigo-700 font-semibold' : 'text-gray-500'}`}>
              {roundLabel(k, t)}
            </button>
            <span className="text-[9px] tabular-nums text-gray-300 h-3">{dateFor[k] ? shortDate(dateFor[k]) : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function InterviewDetail({ job, prepRound, onPickRound, onOpenFull, onTrain, onExample, onSTAR, onGenerateCV, onNegotiate, onToggleFavorite, t }) {
  const effective = deriveStatusFromHistory(job.history) || job.status
  const status = getStatus(effective)
  const sessions = job.interviewSessions || []
  const best = bestMockScore(sessions)
  const exampleCount = Object.keys(job.interviewExamples || {}).length
  const hasExample = !!job.interviewExamples?.[prepRound]
  const roundSessions = sessionsForRound(sessions, prepRound)
  const roundBest = bestMockScore(roundSessions)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-50">
        {typeof job.score === 'number' ? (
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold border shrink-0 ${scoreColorClasses(job.score)}`}>{job.score}</span>
        ) : (
          <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: colorFor(job.company) }}>{initials(job.company)}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold tracking-tight text-gray-900 truncate">{job.company}</span>
            <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${status?.color || 'bg-gray-100 text-gray-500'}`}>{getStatusLabel(effective, t)}</span>
          </div>
          <div className="text-[13px] text-gray-500 truncate">{job.position}</div>
        </div>
        <button onClick={() => onToggleFavorite?.(job.id)} aria-label="favorite" aria-pressed={!!job.favorite}
          className={`shrink-0 text-lg leading-none transition-transform hover:scale-110 ${job.favorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'}`}>★</button>
        <button onClick={() => onOpenFull(job)} className="shrink-0 text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline whitespace-nowrap">
          {t('interviews.openFull')} ›
        </button>
      </div>

      {/* Round selector — pick which round to prepare */}
      <div className="px-4 pt-4 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">{t('interviews.pickRound')}</p>
        <InterviewStepper job={job} prepRound={prepRound} onPick={onPickRound} t={t} />
      </div>

      {/* HERO — prepare the selected round: practice is the primary action */}
      <div className="mx-4 my-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-xl">{INTERVIEW_ROUND_META[prepRound]?.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-tight">{t('interviews.prepare').replace('{round}', roundLabel(prepRound, t))}</div>
            <p className="text-[12px] text-indigo-100 leading-snug mt-1">{t(`interviewFocus.${prepRound}`)}</p>
          </div>
        </div>
        <div className="mt-3.5 flex items-stretch gap-2">
          <button onClick={() => onTrain(job, prepRound)}
            className="flex-1 inline-flex items-center justify-center gap-2 text-[13px] font-bold px-4 py-2.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 shadow-sm transition-colors">
            🎤 {t('interviews.practiceCta')}
          </button>
          <button onClick={() => onExample(job, prepRound)}
            className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2.5 rounded-xl border transition-colors ${hasExample ? 'bg-white/20 border-white/30 text-white hover:bg-white/25' : 'border-white/40 text-white hover:bg-white/10'}`}>
            {hasExample ? '✅' : '📝'} {t('interviews.example')}
          </button>
        </div>
        <div className="mt-2.5 text-[11px] text-indigo-100">
          {roundSessions.length > 0
            ? `${roundSessions.length}× · ${t('interviews.best')} ${roundBest}`
            : t('interviews.notPractised')}
        </div>
      </div>

      {/* Prep toolkit */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{t('interviews.moreTools')}</p>
        <div className="grid grid-cols-2 gap-2">
          <ToolCard tone="indigo" icon="🎯" label={t('interviews.toolStar')} desc={t('interviews.toolStarDesc')} onClick={() => onSTAR?.(job)} />
          <ToolCard tone="gray" icon="🎤" label={t('interviews.toolFreePractice')} desc={t('interviews.toolFreePracticeDesc')} onClick={() => onTrain(job, null)} />
          <ToolCard tone="gray" icon="📄" label={t('interviews.toolCv')} desc={t('interviews.toolCvDesc')} onClick={() => onGenerateCV?.(job)} />
          <ToolCard tone="green" icon="🤝" label={t('interviews.toolNegotiate')} desc={t('interviews.toolNegotiateDesc')} onClick={() => onNegotiate?.(job)} />
        </div>
      </div>

      {/* Your prep summary */}
      {(sessions.length > 0 || exampleCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap px-4 pb-4 pt-1 border-t border-gray-50">
          {sessions.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              🎤 {t('interviews.practiceCount').replace('{n}', sessions.length)}{best >= 0 ? ` · ${t('interviews.best')} ${best}` : ''}
            </span>
          )}
          {exampleCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              📝 {t('interviews.examplesSaved').replace('{n}', exampleCount)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function InterviewsBoard({
  jobs = [],
  onEdit,
  onDelete,
  onAddStep,
  onUpdateHistory,
  onUpdateJob,
  onGenerateCV,
  onViewSavedCV,
  onToggleFavorite,
  onSTAR,
  onDraftEmail,
  t = (k) => k,
}) {
  const [openId, setOpenId] = useState(null)          // full-details drawer
  const [openTab, setOpenTab] = useState('overview')
  const [roundFilter, setRoundFilter] = useState(null)
  const [showArchived, setShowArchived] = useState(() => {
    try { return localStorage.getItem('jobtrackr_interviews_show_archived') === '1' } catch { return false }
  })
  const [selectedId, setSelectedId] = useState(null)  // master-detail selection
  const [mobileOpen, setMobileOpen] = useState(false) // mobile: detail overlay
  const [prepPick, setPrepPick] = useState(null)      // { id, round } user's round choice for the selected job
  const [mock, setMock] = useState(null)              // { job, round } focused practice
  const [example, setExample] = useState(null)        // { job, round } text example
  const [negotiate, setNegotiate] = useState(null)    // job → negotiation prep

  const toggleArchived = () => setShowArchived(v => {
    const next = !v
    try { localStorage.setItem('jobtrackr_interviews_show_archived', next ? '1' : '0') } catch {}
    return next
  })
  const openJob = jobs.find(j => j.id === openId) || null
  const openFull = (j) => { setOpenTab('overview'); setOpenId(j.id) }
  const close = () => setOpenId(null)
  const startTrain = (job, round) => setMock({ job, round })
  const startExample = (job, round) => setExample({ job, round })
  const exampleJob = example ? (jobs.find(j => j.id === example.job.id) || example.job) : null

  // Esc closes the full-details drawer.
  useEffect(() => {
    if (!openJob) return
    const onKey = e => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openJob])

  const { active, outcome, past, stats, roundCounts } = useMemo(() => {
    const all = jobs
      .filter(hasInterviewProcess)
      .sort((a, b) => {
        const fav = (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)
        if (fav) return fav
        const la = new Date((a.history || []).at(-1)?.date || a.date || 0)
        const lb = new Date((b.history || []).at(-1)?.date || b.date || 0)
        return lb - la
      })
    const isArchived = (j) => (deriveStatusFromHistory(j.history) || j.status) === 'archived'
    const archivedCount = all.filter(isArchived).length
    const list = showArchived ? all : all.filter(j => !isArchived(j))
    const counts = {}
    let mockSessions = 0
    let bestScore = -1
    for (const job of list) {
      for (const key of jobRoundKeys(job)) counts[key] = (counts[key] || 0) + 1
      const s = job.interviewSessions || []
      mockSessions += s.length
      const b = bestMockScore(s)
      if (b > bestScore) bestScore = b
    }
    const visible = roundFilter ? list.filter(j => jobRoundKeys(j).includes(roundFilter)) : list
    const buckets = { active: [], outcome: [], past: [] }
    for (const job of visible) buckets[SECTION_OF(deriveStatusFromHistory(job.history) || job.status)].push(job)
    return {
      active: buckets.active,
      outcome: buckets.outcome,
      past: buckets.past,
      roundCounts: counts,
      stats: {
        total: list.length,
        active: list.filter(j => SECTION_OF(deriveStatusFromHistory(j.history) || j.status) === 'active').length,
        offers: list.filter(j => SECTION_OF(deriveStatusFromHistory(j.history) || j.status) === 'outcome').length,
        mockSessions,
        bestScore,
        visible: visible.length,
        archivedCount,
      },
    }
  }, [jobs, roundFilter, showArchived])

  const empty = stats.total === 0
  const roundKeysPresent = INTERVIEW_ROUND_ORDER.filter(k => roundCounts[k] > 0)

  // Derived selection: honour the user's pick, else fall back to the first visible
  // candidature — so we never need a setState-in-effect to keep it valid.
  const visibleList = [...active, ...outcome, ...past]
  const selectedJob = visibleList.find(j => j.id === selectedId) || visibleList[0] || null
  // Derived prep round: the user's pick for THIS job, else the sensible default.
  const prepRound = selectedJob
    ? ((prepPick && prepPick.id === selectedJob.id) ? prepPick.round : defaultPrepRound(selectedJob))
    : null
  const pickRound = (r) => selectedJob && setPrepPick({ id: selectedJob.id, round: r })

  const selectRow = (id) => { setSelectedId(id); setMobileOpen(true) }

  const saveMockSession = (result) => {
    const job = jobs.find(j => j.id === (mock?.job?.id)) || mock?.job
    if (!job) { setMock(null); return }
    const session = {
      type: 'interview', date: new Date().toISOString(), round: mock.round || null,
      score: result.score, hire_decision: result.hire_decision, feedback: result.feedback, transcript: result.transcript,
    }
    onUpdateJob?.(job.id, { interviewSessions: [...(job.interviewSessions || []), session], updated_at: new Date().toISOString() })
    setMock(null)
  }

  const detailProps = selectedJob && {
    job: selectedJob, prepRound, onPickRound: pickRound, onOpenFull: openFull,
    onTrain: startTrain, onExample: startExample, onSTAR, onGenerateCV, onNegotiate: setNegotiate, onToggleFavorite, t,
  }

  return (
    <div className="w-full min-w-0">
      {/* Heading + slim summary */}
      <div className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2"><span>🎤</span>{t('interviews.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('interviews.subtitle')}</p>
      </div>
      {!empty && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12.5px] text-gray-500 mb-3">
          <span><b className="text-gray-900 font-semibold">{stats.total}</b> {t('interviews.statTotal')}</span>
          <span className="text-gray-300">·</span>
          <span><b className="text-purple-700 font-semibold">{stats.active}</b> {t('interviews.statActive')}</span>
          <span><b className="text-green-700 font-semibold">{stats.offers}</b> {t('interviews.statOffers')}</span>
          {stats.mockSessions > 0 && (
            <><span className="text-gray-300">·</span><span>🎤 {stats.mockSessions}{stats.bestScore >= 0 ? ` · ${t('interviews.best')} ${stats.bestScore}` : ''}</span></>
          )}
        </div>
      )}

      <div className="mb-4 [&:empty]:hidden">
        <UpcomingMeetings jobs={jobs} t={t} />
      </div>

      {empty ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
          <div className="text-4xl mb-3">🎤</div>
          <p className="text-gray-700 font-semibold">{t('interviews.emptyTitle')}</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{t('interviews.emptyBody')}</p>
        </div>
      ) : stats.visible === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-14 px-6">
          <p className="text-gray-600 font-medium">{t('interviews.filterEmpty')}</p>
          <button onClick={() => setRoundFilter(null)} className="mt-3 text-sm text-indigo-600 hover:underline">{t('interviews.filterClear')}</button>
        </div>
      ) : (
        <div className="md:grid md:grid-cols-[minmax(260px,300px)_1fr] md:gap-5 md:items-start">
          {/* Master list */}
          <InterviewList
            active={active} outcome={outcome} past={past}
            selectedId={selectedJob?.id} onSelect={selectRow} onToggleFavorite={onToggleFavorite}
            roundKeysPresent={roundKeysPresent} roundCounts={roundCounts} roundFilter={roundFilter} setRoundFilter={setRoundFilter}
            total={stats.total} archivedCount={stats.archivedCount} showArchived={showArchived} toggleArchived={toggleArchived}
            t={t}
          />
          {/* Detail (desktop) */}
          <div className="hidden md:block">
            {detailProps && <InterviewDetail {...detailProps} />}
          </div>
        </div>
      )}

      {/* Detail (mobile full-screen overlay) */}
      {mobileOpen && detailProps && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-50 overflow-y-auto animate-slide-up">
          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 h-12 bg-white/95 backdrop-blur border-b border-gray-100">
            <button onClick={() => setMobileOpen(false)} className="flex items-center gap-1 text-sm font-semibold text-indigo-600">
              ‹ {t('interviews.back')}
            </button>
          </div>
          <div className="p-3">
            <InterviewDetail {...detailProps} />
          </div>
        </div>
      )}

      {/* Focused / free mock practice */}
      {mock && (
        <MockInterviewChatbot
          job={mock.job}
          cv={mock.job?.cvSaved?.markdown || ''}
          round={mock.round}
          roundName={mock.round ? roundLabel(mock.round, t) : null}
          roundFocus={mock.round ? roundPrompt(mock.round) : ''}
          onClose={() => setMock(null)}
          onInterviewComplete={saveMockSession}
        />
      )}

      {/* Text example interview */}
      {exampleJob && (
        <InterviewExample
          job={exampleJob}
          round={example.round}
          roundName={example.round ? roundLabel(example.round, t) : null}
          roundFocus={example.round ? roundPrompt(example.round) : ''}
          cv={exampleJob.cvSaved?.markdown || ''}
          onClose={() => setExample(null)}
          onSave={onUpdateJob}
          t={t}
        />
      )}

      {/* Negotiation prep */}
      {negotiate && (
        <NegotiationAssistant job={negotiate} onClose={() => setNegotiate(null)} onSave={onUpdateJob} t={t} />
      )}

      {/* Full-details drawer */}
      {openJob && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={close} />
          <aside className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[600px] xl:w-[780px] bg-white border-l border-gray-100 shadow-2xl flex flex-col animate-slide-up md:animate-none">
            <div className="flex-1 overflow-y-auto">
              <CandidatureDrawer
                key={`${openJob.id}:${openTab}`}
                job={openJob}
                initialTab={openTab}
                onClose={close}
                onEdit={onEdit}
                onDelete={(j) => { close(); onDelete?.(j) }}
                onUpdateJob={onUpdateJob}
                onAddStep={onAddStep}
                onUpdateHistory={onUpdateHistory}
                onGenerateCV={onGenerateCV}
                onViewSavedCV={onViewSavedCV}
                onSTAR={onSTAR}
                onDraftEmail={onDraftEmail}
                t={t}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
