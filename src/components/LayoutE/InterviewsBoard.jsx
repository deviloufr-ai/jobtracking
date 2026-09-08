// InterviewsBoard — a board dedicated to interviews & prep, sitting below the
// Applications tracker in the nav. It lists ONLY candidatures that have or had an
// interview process (see hasInterviewProcess in useJobs) as a BIG CARD each, with
// the whole training toolkit inside: focused mock interviews per level (screening
// / technical / manager / final — each steers the AI to that level's approach),
// STAR prep, CV tailoring and salary-negotiation prep, plus the detected
// interview journey. Cards open the same master-detail CandidatureDrawer for the
// full timeline & results.
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

// Effective status → which board section a candidature belongs to.
const SECTION_OF = (status) => {
  if (status === 'offer' || status === 'done') return 'outcome'
  if (status === 'rejected' || status === 'rejected_ats' || status === 'cancelled' || status === 'archived') return 'past'
  return 'active' // interview / waiting / anything still live
}

const scoreOf = (s) => s?.feedback?.score ?? s?.score
// Best (highest) recruiter score across a set of mock-interview sessions.
const bestMockScore = (sessions = []) =>
  sessions.reduce((m, s) => { const v = scoreOf(s); return typeof v === 'number' && v > m ? v : m }, -1)
// Sessions practised for a specific interview level (by tagged round).
const sessionsForRound = (sessions = [], key) => sessions.filter(s => (s.round || null) === key)

function StatTile({ icon, value, label, sub, accent = 'text-gray-900' }) {
  return (
    <div className="flex-1 min-w-[120px] bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{icon}</span>
        <span className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</span>
      </div>
      <p className="text-[12px] font-medium text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// One interview-level training tile: a text example interview (Q + model answers)
// AND a focused voice mock, both tailored to this level's approach.
function TrainTile({ levelKey, reached, sessions, hasExample, onTrain, onExample, t }) {
  const meta = INTERVIEW_ROUND_META[levelKey]
  const done = sessionsForRound(sessions, levelKey)
  const best = bestMockScore(done)
  return (
    <div className={`relative rounded-xl border p-3 transition-all ${reached ? 'border-current ' + meta.color : 'bg-white border-gray-200'}`}>
      {reached && (
        <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wide opacity-70">✓ {t('interviews.reached')}</span>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{meta.icon}</span>
        <span className="text-[13px] font-bold text-gray-900">{roundLabel(levelKey, t)}</span>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug mt-1 min-h-[2.4em] line-clamp-2">{t(`interviewFocus.${levelKey}`)}</p>
      <div className="text-[10px] font-medium text-gray-400 mt-1.5">
        {done.length > 0 ? `${done.length}× · ${t('interviews.best')} ${best}` : t('interviews.notPractised')}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <button
          onClick={onExample}
          className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          📝 {t('interviews.example')}{hasExample ? ' ✓' : ''}
        </button>
        <button
          onClick={onTrain}
          className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          🎤 {t('interviews.train')}
        </button>
      </div>
    </div>
  )
}

function ToolButton({ icon, label, onClick, tone = 'gray' }) {
  const tones = {
    gray: 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100',
    green: 'bg-green-50 border-green-100 text-green-700 hover:bg-green-100',
  }
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${tones[tone]}`}>
      <span>{icon}</span>{label}
    </button>
  )
}

function CandidatureCard({ job, active, highlightRound, onOpen, onTrain, onExample, onSTAR, onGenerateCV, onNegotiate, onToggleFavorite, t }) {
  const history = job.history || []
  const effective = deriveStatusFromHistory(history) || job.status
  const status = getStatus(effective)
  const sessions = job.interviewSessions || []
  const best = bestMockScore(sessions)
  const starReady = !!job.starSaved
  const journey = jobInterviewRounds(job)          // actual interview steps, chronological
  const reached = new Set(jobRoundKeys(job))       // levels this candidature has reached

  return (
    <div className={`rounded-2xl border shadow-sm bg-white transition-all ${active ? 'border-indigo-300 ring-1 ring-inset ring-indigo-200' : 'border-gray-100 hover:shadow-md'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        {typeof job.score === 'number' ? (
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border shrink-0 ${scoreColorClasses(job.score)}`}>{job.score}</span>
        ) : (
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: colorFor(job.company) }}>{initials(job.company)}</span>
        )}
        <button onClick={() => onOpen(job, 'overview')} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-tight text-gray-900 truncate">{job.company}</span>
            <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${status?.color || 'bg-gray-100 text-gray-500'}`}>{getStatusLabel(effective, t)}</span>
          </div>
          <div className="text-[12.5px] text-gray-500 truncate">{job.position}</div>
        </button>
        <button
          onClick={() => onToggleFavorite?.(job.id)}
          aria-label="favorite" aria-pressed={!!job.favorite}
          className={`shrink-0 text-lg leading-none transition-transform hover:scale-110 ${job.favorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'}`}
        >★</button>
        <button onClick={() => onOpen(job, 'overview')} className="shrink-0 text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline">
          {t('interviews.details')} ›
        </button>
      </div>

      {/* Practice summary */}
      {(sessions.length > 0 || starReady) && (
        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
          {sessions.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              🎤 {t('interviews.practiceCount').replace('{n}', sessions.length)}{best >= 0 ? ` · ${t('interviews.best')} ${best}` : ''}
            </span>
          )}
          {starReady && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">🎯 {t('interviews.starReady')}</span>
          )}
        </div>
      )}

      {/* Interview journey — the rounds actually detected from calendar/email */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{t('interviews.journey')}</p>
        {journey.length === 0 ? (
          <p className="text-[12px] text-gray-400 italic">{t('interviews.noRoundYet')}</p>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {journey.map((r, i) => {
              const meta = INTERVIEW_ROUND_META[r.key]
              const on = highlightRound === r.key
              return (
                <span key={i} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.color} ${on ? 'ring-1 ring-inset ring-current' : ''}`}>
                  <span>{meta.icon}</span>{roundLabel(r.key, t, r.number)}
                  <span className="opacity-60 tabular-nums">· {shortDate(r.date)}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Train to succeed — focused practice per interview level */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{t('interviews.trainTitle')}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {INTERVIEW_TRAIN_LEVELS.map(levelKey => (
            <TrainTile
              key={levelKey}
              levelKey={levelKey}
              reached={reached.has(levelKey)}
              sessions={sessions}
              hasExample={!!job.interviewExamples?.[levelKey]}
              onTrain={() => onTrain(job, levelKey)}
              onExample={() => onExample(job, levelKey)}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* More prep tools */}
      <div className="flex items-center gap-2 flex-wrap px-4 pb-4 pt-1 border-t border-gray-50">
        <ToolButton icon="🎯" label={t('interviews.toolStar')} tone="indigo" onClick={() => onSTAR?.(job)} />
        <ToolButton icon="🎤" label={t('interviews.toolFreePractice')} onClick={() => onTrain(job, null)} />
        <ToolButton icon="📄" label={t('interviews.toolCv')} onClick={() => onGenerateCV?.(job)} />
        <ToolButton icon="🤝" label={t('interviews.toolNegotiate')} tone="green" onClick={() => onNegotiate?.(job)} />
      </div>
    </div>
  )
}

function Section({ title, hint, accent, jobs, openId, highlightRound, onOpen, onTrain, onExample, onSTAR, onGenerateCV, onNegotiate, onToggleFavorite, t, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (jobs.length === 0) return null
  return (
    <section className="mb-5">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 px-1 mb-2.5 text-left group">
        <span className={`w-1.5 h-4 rounded-full ${accent}`} />
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{jobs.length}</span>
        {hint && <span className="text-[11px] text-gray-400 hidden sm:inline">· {hint}</span>}
        <span className={`ml-auto text-gray-300 group-hover:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="space-y-3">
          {jobs.map(job => (
            <CandidatureCard
              key={job.id}
              job={job}
              active={openId === job.id}
              highlightRound={highlightRound}
              onOpen={onOpen}
              onTrain={onTrain}
              onExample={onExample}
              onSTAR={onSTAR}
              onGenerateCV={onGenerateCV}
              onNegotiate={onNegotiate}
              onToggleFavorite={onToggleFavorite}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
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
  const [openId, setOpenId] = useState(null)
  const [openTab, setOpenTab] = useState('overview')
  const [roundFilter, setRoundFilter] = useState(null) // null = all interview types
  const [showArchived, setShowArchived] = useState(() => {
    try { return localStorage.getItem('jobtrackr_interviews_show_archived') === '1' } catch { return false }
  })
  const [mock, setMock] = useState(null)               // { job, round } focused practice
  const [example, setExample] = useState(null)         // { job, round } text example interview
  const [negotiate, setNegotiate] = useState(null)     // job → negotiation prep
  const toggleArchived = () => setShowArchived(v => {
    const next = !v
    try { localStorage.setItem('jobtrackr_interviews_show_archived', next ? '1' : '0') } catch {}
    return next
  })
  const openJob = jobs.find(j => j.id === openId) || null
  const open = (j, tab = 'overview') => { setOpenTab(tab); setOpenId(j.id) }
  const close = () => setOpenId(null)
  const startTrain = (job, round) => setMock({ job, round })
  const startExample = (job, round) => setExample({ job, round })
  // Bind the example modal to the freshest job record so a just-saved example
  // shows without reopening.
  const exampleJob = example ? (jobs.find(j => j.id === example.job.id) || example.job) : null

  const drawerWidth = (typeof window !== 'undefined' && window.innerWidth >= 1536) ? 780 : 580

  // Esc closes the drawer.
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
    // Hide archived candidatures unless the toggle is on.
    const list = showArchived ? all : all.filter(j => !isArchived(j))
    const counts = {}
    let mockSessions = 0
    let bestScore = -1
    for (const job of list) {
      for (const key of jobRoundKeys(job)) counts[key] = (counts[key] || 0) + 1
      const sessions = job.interviewSessions || []
      mockSessions += sessions.length
      const b = bestMockScore(sessions)
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

  // Persist a completed focused mock session onto the job, tagged with its round.
  const saveMockSession = (result) => {
    const job = jobs.find(j => j.id === (mock?.job?.id)) || mock?.job
    if (!job) { setMock(null); return }
    const session = {
      type: 'interview',
      date: new Date().toISOString(),
      round: mock.round || null,
      score: result.score,
      hire_decision: result.hire_decision,
      feedback: result.feedback,
      transcript: result.transcript,
    }
    onUpdateJob?.(job.id, { interviewSessions: [...(job.interviewSessions || []), session], updated_at: new Date().toISOString() })
    setMock(null)
  }

  return (
    <div
      className={`w-full min-w-0 transition-[padding] duration-300 ${openJob ? 'md:pr-[var(--drawer-pad)]' : ''}`}
      style={openJob ? { '--drawer-pad': `${drawerWidth + 16}px`, '--drawer-w': `${drawerWidth}px` } : undefined}
    >
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2"><span>🎤</span>{t('interviews.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('interviews.subtitle')}</p>
      </div>

      {!empty && (
        <div className="flex flex-wrap gap-3 mb-5">
          <StatTile icon="🎤" value={stats.total} label={t('interviews.statTotal')} />
          <StatTile icon="⏳" value={stats.active} label={t('interviews.statActive')} accent="text-purple-700" />
          <StatTile icon="🎉" value={stats.offers} label={t('interviews.statOffers')} accent="text-green-700" />
          <StatTile
            icon="💪"
            value={stats.mockSessions}
            label={t('interviews.statMock')}
            sub={stats.bestScore >= 0 ? t('interviews.bestScore').replace('{score}', stats.bestScore) : t('interviews.noMockYet')}
            accent="text-indigo-700"
          />
        </div>
      )}

      <div className="mb-5 [&:empty]:hidden">
        <UpcomingMeetings jobs={jobs} t={t} />
      </div>

      {!empty && (roundKeysPresent.length > 0 || stats.archivedCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {roundKeysPresent.length > 0 && (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mr-1">{t('interviews.filterLabel')}</span>
              <button
                onClick={() => setRoundFilter(null)}
                className={`inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full border transition-colors ${roundFilter === null ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {t('interviews.filterAll')} <span className="opacity-60">{stats.total}</span>
              </button>
              {roundKeysPresent.map(key => {
                const meta = INTERVIEW_ROUND_META[key]
                const on = roundFilter === key
                return (
                  <button
                    key={key}
                    onClick={() => setRoundFilter(on ? null : key)}
                    className={`inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full border transition-colors ${on ? `${meta.color} border-current` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >
                    <span>{meta.icon}</span>{roundLabel(key, t)} <span className="opacity-60">{roundCounts[key]}</span>
                  </button>
                )
              })}
            </>
          )}
          {/* Show / hide archived candidatures (hidden by default). */}
          {stats.archivedCount > 0 && (
            <button
              onClick={toggleArchived}
              className={`ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border transition-colors ${showArchived ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <span>🗄️</span>{showArchived ? t('interviews.hideArchived') : t('interviews.showArchived')} <span className="opacity-60">{stats.archivedCount}</span>
            </button>
          )}
        </div>
      )}

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
        <>
          <Section title={t('interviews.sectionActive')} hint={t('interviews.sectionActiveHint')} accent="bg-purple-500"
            jobs={active} openId={openId} highlightRound={roundFilter}
            onOpen={open} onTrain={startTrain} onExample={startExample} onSTAR={onSTAR} onGenerateCV={onGenerateCV} onNegotiate={setNegotiate} onToggleFavorite={onToggleFavorite} t={t} />
          <Section title={t('interviews.sectionOutcome')} hint={t('interviews.sectionOutcomeHint')} accent="bg-green-500"
            jobs={outcome} openId={openId} highlightRound={roundFilter}
            onOpen={open} onTrain={startTrain} onExample={startExample} onSTAR={onSTAR} onGenerateCV={onGenerateCV} onNegotiate={setNegotiate} onToggleFavorite={onToggleFavorite} t={t} />
          <Section title={t('interviews.sectionPast')} hint={t('interviews.sectionPastHint')} accent="bg-gray-400"
            jobs={past} openId={openId} highlightRound={roundFilter}
            onOpen={open} onTrain={startTrain} onExample={startExample} onSTAR={onSTAR} onGenerateCV={onGenerateCV} onNegotiate={setNegotiate} onToggleFavorite={onToggleFavorite} t={t}
            defaultOpen={false} />
        </>
      )}

      {/* Focused mock-interview practice, launched from a card's train tile. */}
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

      {/* Text example interview (questions + model answers) for a level. */}
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

      {/* Salary-negotiation prep. */}
      {negotiate && (
        <NegotiationAssistant job={negotiate} onClose={() => setNegotiate(null)} onSave={onUpdateJob} t={t} />
      )}

      {/* Master-detail drawer — same component the tracker uses. */}
      {openJob && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={close} />
          <aside className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[var(--drawer-w)] bg-white border-l border-gray-100 shadow-2xl flex flex-col animate-slide-up md:animate-none">
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
