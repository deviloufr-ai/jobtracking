// InterviewsBoard — a board dedicated to interviews & prep, sitting below the
// Applications tracker in the nav. It lists ONLY candidatures that have or had an
// interview process (see hasInterviewProcess in useJobs): the ones currently in
// interviews, those that turned into an offer/hire, and past ones worth learning
// from. It doubles as the "improvement" home — surfacing mock-interview practice
// (interviewSessions) and STAR prep for each, and opening the same master-detail
// CandidatureDrawer (pre-focused on its Interview tab) so every existing
// interview feature works unchanged.
import { useState, useEffect, useMemo } from 'react'
import { getStatus, getStatusLabel, deriveStatusFromHistory, hasInterviewProcess } from '../../hooks/useJobs'
import { scoreColorClasses } from '../ScoreJob'
import UpcomingMeetings from '../UpcomingMeetings'
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

// Best (highest) recruiter score across a job's saved mock-interview sessions.
const bestMockScore = (sessions = []) =>
  sessions.reduce((m, s) => {
    const v = s?.feedback?.score ?? s?.score
    return typeof v === 'number' && v > m ? v : m
  }, -1)

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

// Compact horizontal timeline of the interview-relevant steps (dots + dates).
function MiniTimeline({ history = [] }) {
  const steps = history.filter(h => h?.date && ['interview', 'done', 'waiting', 'offer'].includes(h.status))
  if (steps.length === 0) return null
  return (
    <ol className="hidden lg:flex items-start w-max shrink-0">
      {steps.map((h, i) => (
        <li key={i} className="relative shrink-0 flex flex-col items-center">
          <div className="relative h-2 w-full flex items-center justify-center px-3">
            {i > 0 && <span className="absolute top-1/2 -translate-y-1/2 left-0 w-1/2 h-0.5 bg-gray-200" />}
            {i < steps.length - 1 && <span className="absolute top-1/2 -translate-y-1/2 left-1/2 w-1/2 h-0.5 bg-gray-200" />}
            <span className={`relative z-[1] w-2 h-2 rounded-full ${getStatus(h.status)?.dot || 'bg-gray-400'}`} />
          </div>
          <span className="mt-1 px-1.5 text-[9px] leading-none tabular-nums text-gray-400 whitespace-nowrap">{shortDate(h.date)}</span>
        </li>
      ))}
    </ol>
  )
}

function InterviewRow({ job, active, onOpen, onPrep, onSTAR, onToggleFavorite, t }) {
  const history = job.history || []
  const effective = deriveStatusFromHistory(history) || job.status
  const status = getStatus(effective)
  const sessions = job.interviewSessions || []
  const best = bestMockScore(sessions)
  const starReady = !!job.starSaved
  const last = history.at(-1)

  return (
    <div
      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
        active ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-gray-50'
      }`}
    >
      <button
        onClick={() => onOpen(job, 'overview')}
        aria-current={active ? 'true' : undefined}
        className="flex-1 min-w-0 overflow-hidden flex items-center gap-3 text-left"
      >
        {typeof job.score === 'number' ? (
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border shrink-0 ${scoreColorClasses(job.score)}`}>
            {job.score}
          </span>
        ) : (
          <span className="w-9 shrink-0" />
        )}
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: colorFor(job.company) }}
        >
          {initials(job.company)}
        </span>
        <span className="min-w-0 w-[240px] shrink-0">
          <span className="block text-[13.5px] font-semibold tracking-tight text-gray-900 truncate">{job.company}</span>
          <span className="block text-[12px] text-gray-400 truncate">{job.position}</span>
        </span>

        <MiniTimeline history={history} />

        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${status?.color || 'bg-gray-100 text-gray-500'}`}>
            {getStatusLabel(effective, t)}
          </span>
          {sessions.length > 0 && (
            <span
              title={t('interviews.mockPractisedTip')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full shrink-0"
            >
              🎤 {sessions.length}{best >= 0 ? ` · ${best}` : ''}
            </span>
          )}
          {starReady && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
              🎯 {t('interviews.starReady')}
            </span>
          )}
        </span>

        <span className="hidden md:block w-16 text-right text-[12px] text-gray-400 tabular-nums shrink-0">
          {shortDate(last?.date || job.date)}
        </span>
      </button>

      {/* Prep actions */}
      <button
        onClick={(e) => { e.stopPropagation(); onPrep(job) }}
        title={t('interviews.mockCta')}
        className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors shrink-0"
      >
        🎤 <span className="hidden xl:inline">{t('interviews.mockCta')}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onSTAR?.(job) }}
        title={t('interviews.starCta')}
        className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors shrink-0"
      >
        🎯 <span className="hidden xl:inline">{t('interviews.starCta')}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(job.id) }}
        aria-label="favorite"
        aria-pressed={!!job.favorite}
        className={`shrink-0 text-base leading-none transition-transform hover:scale-110 ${
          job.favorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
        }`}
      >
        ★
      </button>
    </div>
  )
}

function Section({ title, hint, accent, jobs, openId, onOpen, onPrep, onSTAR, onToggleFavorite, t, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (jobs.length === 0) return null
  return (
    <section>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-1 mb-2 text-left group"
      >
        <span className={`w-1.5 h-4 rounded-full ${accent}`} />
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{jobs.length}</span>
        {hint && <span className="text-[11px] text-gray-400 hidden sm:inline">· {hint}</span>}
        <span className={`ml-auto text-gray-300 group-hover:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50 mb-5">
          {jobs.map(job => (
            <InterviewRow
              key={job.id}
              job={job}
              active={openId === job.id}
              onOpen={onOpen}
              onPrep={onPrep}
              onSTAR={onSTAR}
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
  const openJob = jobs.find(j => j.id === openId) || null
  const open = (j, tab = 'overview') => { setOpenTab(tab); setOpenId(j.id) }
  const close = () => setOpenId(null)

  const drawerWidth = (typeof window !== 'undefined' && window.innerWidth >= 1536) ? 780 : 580

  // No explicit cleanup effect is needed when a job leaves the interview set
  // (e.g. deleted): `openJob` is recomputed from `jobs` each render, so it falls
  // back to null and the drawer simply stops rendering.

  // Esc closes the drawer.
  useEffect(() => {
    if (!openJob) return
    const onKey = e => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openJob])

  const { active, outcome, past, stats } = useMemo(() => {
    const list = jobs
      .filter(hasInterviewProcess)
      // Favorites first, then most recent activity.
      .sort((a, b) => {
        const fav = (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)
        if (fav) return fav
        const la = new Date((a.history || []).at(-1)?.date || a.date || 0)
        const lb = new Date((b.history || []).at(-1)?.date || b.date || 0)
        return lb - la
      })
    const buckets = { active: [], outcome: [], past: [] }
    let mockSessions = 0
    let bestScore = -1
    for (const job of list) {
      const effective = deriveStatusFromHistory(job.history) || job.status
      buckets[SECTION_OF(effective)].push(job)
      const sessions = job.interviewSessions || []
      mockSessions += sessions.length
      const b = bestMockScore(sessions)
      if (b > bestScore) bestScore = b
    }
    return {
      active: buckets.active,
      outcome: buckets.outcome,
      past: buckets.past,
      stats: {
        total: list.length,
        active: buckets.active.length,
        offers: buckets.outcome.length,
        mockSessions,
        bestScore,
      },
    }
  }, [jobs])

  const empty = stats.total === 0

  return (
    <div
      className={`w-full min-w-0 transition-[padding] duration-300 ${openJob ? 'md:pr-[var(--drawer-pad)]' : ''}`}
      style={openJob ? { '--drawer-pad': `${drawerWidth + 16}px`, '--drawer-w': `${drawerWidth}px` } : undefined}
    >
      {/* Heading */}
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <span>🎤</span>{t('interviews.title')}
        </h1>
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

      {/* Upcoming interviews from the connected calendar — self-hides when empty. */}
      <div className="mb-5 [&:empty]:hidden">
        <UpcomingMeetings jobs={jobs} t={t} />
      </div>

      {empty ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16 px-6">
          <div className="text-4xl mb-3">🎤</div>
          <p className="text-gray-700 font-semibold">{t('interviews.emptyTitle')}</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{t('interviews.emptyBody')}</p>
        </div>
      ) : (
        <>
          <Section
            title={t('interviews.sectionActive')}
            hint={t('interviews.sectionActiveHint')}
            accent="bg-purple-500"
            jobs={active}
            openId={openId}
            onOpen={open}
            onPrep={(j) => open(j, 'interview')}
            onSTAR={onSTAR}
            onToggleFavorite={onToggleFavorite}
            t={t}
          />
          <Section
            title={t('interviews.sectionOutcome')}
            hint={t('interviews.sectionOutcomeHint')}
            accent="bg-green-500"
            jobs={outcome}
            openId={openId}
            onOpen={open}
            onPrep={(j) => open(j, 'interview')}
            onSTAR={onSTAR}
            onToggleFavorite={onToggleFavorite}
            t={t}
          />
          <Section
            title={t('interviews.sectionPast')}
            hint={t('interviews.sectionPastHint')}
            accent="bg-gray-400"
            jobs={past}
            openId={openId}
            onOpen={open}
            onPrep={(j) => open(j, 'interview')}
            onSTAR={onSTAR}
            onToggleFavorite={onToggleFavorite}
            t={t}
            defaultOpen={false}
          />
        </>
      )}

      {/* Master-detail drawer — same component the tracker uses, opened on the
          Interview tab from the prep actions. Keyed by job+tab so the requested
          initial tab takes effect on each open. */}
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
