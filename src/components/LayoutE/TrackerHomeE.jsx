// TrackerHomeE — the Tracker home for the new "E — Focus + List" layout.
//
// Composes: FocusBand (auto-hidden when caught up) + the reused Filters bar
// (search · status chips · fav/archive · Table/Kanban/Platforms view switch) +
// the selected view (unified list / Kanban / Platforms) driven by the SAME
// `filtered` list the classic tracker uses + a right master-detail DRAWER.
//
// The list stays clickable while the drawer is open: clicking another
// candidature switches it in place (active row highlighted), the content reflows
// left of the drawer on desktop, and the drawer closes on ✕ / Esc / re-clicking
// the open row. Every view opens the same drawer, whose body reuses JobCard.
import { useState, useEffect, Fragment } from 'react'
import { getStatus, getStatusLabel } from '../../hooks/useJobs'
import { scoreColorClasses } from '../ScoreJob'
import KanbanBoard from '../KanbanBoard'
import MobilePipeline from '../MobilePipeline'
import PlatformView from '../PlatformView'
import FocusBand from './FocusBand'
import ListToolbar from './ListToolbar'
import CandidatureDrawer from './CandidatureDrawer'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')

// Compact per-row stage progress (Applied → Reviewing → Interview → Offer).
const STAGES = [{ key: 'sent', label: 'Applied' }, { key: 'reviewing', label: 'Reviewing' }, { key: 'interview', label: 'Interview' }, { key: 'offer', label: 'Offer' }]
const STAGE_IX = { todo: -1, sent: 0, reviewing: 1, waiting: 1, interview: 2, done: 2, offer: 3 }
const TERMINAL = new Set(['rejected', 'rejected_ats', 'cancelled', 'archived'])
const ACCENT = 'var(--theme-primary, #6366f1)'
const MUTED = 'var(--theme-border, #d8dbe4)'

function StageBar({ status, title }) {
  const terminal = TERMINAL.has(status)
  const ix = STAGE_IX[status] ?? -1
  return (
    <div className="hidden lg:flex items-center w-[150px] shrink-0" title={title || (terminal ? 'Closed' : STAGES[ix]?.label || '')}>
      {STAGES.map((s, i) => (
        <Fragment key={s.key}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: !terminal && i <= ix ? ACCENT : MUTED }} />
          {i < STAGES.length - 1 && <span className="h-0.5 flex-1" style={{ background: !terminal && i < ix ? ACCENT : MUTED }} />}
        </Fragment>
      ))}
    </div>
  )
}

export default function TrackerHomeE({
  jobs = [],
  filtered = [],
  userName,
  // filter / view state (reused from App)
  filters,
  onFilterChange,
  onResetFilters,
  total = 0,
  showFavOnly,
  onToggleFav,
  favCount,
  showArchived,
  onToggleArchived,
  archivedCount,
  view = 'table',
  onViewChange,
  sort,
  onSort,
  language = 'en',
  // multi-select (bulk actions)
  selectedJobIds = new Set(),
  onToggleSelect,
  onSelectAll,
  // detail / action handlers
  onEdit,
  onDelete,
  onStatusChange,
  onAddStep,
  onUpdateHistory,
  onUpdateJob,
  onGenerateCV,
  onViewSavedCV,
  onToggleFavorite,
  checkAllPositions,
  onSTAR,
  onDraftEmail,
  t = (k) => k,
}) {
  const [openId, setOpenId] = useState(null)
  const openJob = jobs.find(j => j.id === openId) || null
  const open = (j) => setOpenId(j.id)
  const compact = !!openJob // drawer open → list is narrow, hide extra columns

  // Close the drawer if its job disappears (deleted / filtered away entirely).
  useEffect(() => {
    if (openId && !jobs.some(j => j.id === openId)) setOpenId(null)
  }, [jobs, openId])

  // Esc closes the drawer.
  useEffect(() => {
    if (!openJob) return
    const onKey = e => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openJob])

  const close = () => setOpenId(null)

  const filteredIds = filtered.map(j => j.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedJobIds.has(id))

  const resetBtn = (
    <button onClick={onResetFilters} className="mt-3 text-sm text-indigo-600 hover:underline">
      {t('empty.resetFilters')}
    </button>
  )

  return (
    <div className={`w-full min-w-0 transition-[padding] duration-300 ${openJob ? 'md:pr-[616px] 2xl:pr-[916px]' : ''}`}>
      <FocusBand
        jobs={jobs}
        userName={userName}
        onOpenJob={open}
        onGenerateCV={onGenerateCV}
        onSTAR={onSTAR}
        t={t}
      />

      <ListToolbar
        filters={filters}
        onChange={onFilterChange}
        sort={sort}
        onSort={onSort}
        view={view}
        onViewChange={onViewChange}
        showFavOnly={showFavOnly}
        onToggleFav={onToggleFav}
        favCount={favCount}
        showArchived={showArchived}
        onToggleArchived={onToggleArchived}
        archivedCount={archivedCount}
        total={total}
        filteredCount={filtered.length}
        onReset={onResetFilters}
        t={t}
      />

      {view === 'platforms' ? (
        <PlatformView jobs={filtered} onOpen={open} language={language} t={t} />
      ) : view === 'kanban' ? (
        filtered.length > 0 ? (
          <>
            <div className="md:hidden">
              <MobilePipeline jobs={filtered} onOpen={open} onToggleFavorite={onToggleFavorite} t={t} />
            </div>
            <div className="hidden md:block">
              <KanbanBoard
                jobs={filtered}
                filters={filters}
                showArchived={showArchived}
                onStatusChange={onStatusChange}
                onEdit={open}
                onToggleFavorite={onToggleFavorite}
                t={t}
              />
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16">
            <p className="text-gray-500 font-medium">{t('empty.noResults') || t('empty.noApplications')}</p>
            {resetBtn}
          </div>
        )
      ) : (
        /* table = unified list */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 font-medium">{t('empty.noResults') || t('empty.noApplications')}</p>
              {resetBtn}
            </div>
          ) : (
            <>
              {/* select-all header — feeds the bulk-action bar */}
              <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onSelectAll?.(filteredIds)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer shrink-0"
                  aria-label={t('bulkBar.selectAll') || 'Tout sélectionner'}
                />
                <span className="text-xs text-gray-400">
                  {selectedJobIds.size > 0
                    ? `${selectedJobIds.size} ${t('bulkBar.selected') || 'sélectionné(s)'}`
                    : (t('bulkBar.selectAll') || 'Tout sélectionner')}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {filtered.map(job => {
                  const active = openId === job.id
                  const selected = selectedJobIds.has(job.id)
                  const last = (job.history || []).at(-1)
                  const lastNote = last?.note ? last.note.replace(/\s*\n\s*/g, ' ') : ''
                  return (
                    <div
                      key={job.id}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        active ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200'
                          : selected ? 'bg-indigo-50/40' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect?.(job.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer shrink-0"
                        aria-label={`${t('bulkBar.select') || 'Sélectionner'} ${job.company}`}
                      />
                      <button
                        onClick={() => setOpenId(cur => (cur === job.id ? null : job.id))}
                        aria-current={active ? 'true' : undefined}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left"
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
                        <span className={`min-w-0 ${compact ? 'flex-1' : 'w-[240px] shrink-0'}`}>
                          <span className="block text-[13.5px] font-semibold tracking-tight text-gray-900 truncate">{job.company}</span>
                          <span className="block text-[12px] text-gray-400 truncate">{job.position}</span>
                        </span>
                        {!compact && <StageBar status={last?.status || job.status} title={lastNote} />}
                        <span className="w-32 shrink-0">
                          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatus(last?.status || job.status)?.color || 'bg-gray-100 text-gray-500'}`}>
                            {getStatusLabel(last?.status || job.status, t)}
                          </span>
                        </span>
                        {!compact && (
                          <span className="hidden md:block flex-1 min-w-0 truncate text-[12.5px] text-gray-400">{lastNote}</span>
                        )}
                        {!compact && (
                          <span className="hidden md:block w-16 text-right text-[12px] text-gray-400 tabular-nums shrink-0">
                            {shortDate(last?.date || job.date)}
                          </span>
                        )}
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
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Master-detail drawer */}
      {openJob && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={close} />
          <aside className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[600px] 2xl:w-[900px] bg-white border-l border-gray-100 shadow-2xl flex flex-col animate-slide-up md:animate-none">
            <div className="flex-1 overflow-y-auto">
              <CandidatureDrawer
                job={openJob}
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
