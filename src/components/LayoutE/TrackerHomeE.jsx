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
import { useState, useEffect } from 'react'
import { getStatus, getStatusLabel } from '../../hooks/useJobs'
import JobCard from '../JobCard'
import Filters from '../Filters'
import KanbanBoard from '../KanbanBoard'
import MobilePipeline from '../MobilePipeline'
import PlatformView from '../PlatformView'
import FocusBand from './FocusBand'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

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
    <div className={`w-full min-w-0 transition-[padding] duration-300 ${openJob ? 'md:pr-[488px]' : ''}`}>
      <FocusBand
        jobs={jobs}
        userName={userName}
        onOpenJob={open}
        onGenerateCV={onGenerateCV}
        onSTAR={onSTAR}
        t={t}
      />

      <Filters
        filters={filters}
        onChange={onFilterChange}
        onReset={onResetFilters}
        total={total}
        filtered={filtered.length}
        showFavOnly={showFavOnly}
        onToggleFav={onToggleFav}
        favCount={favCount}
        showArchived={showArchived}
        onToggleArchived={onToggleArchived}
        archivedCount={archivedCount}
        view={view}
        onViewChange={onViewChange}
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
                  const status = getStatus(job.status)
                  const active = openId === job.id
                  const selected = selectedJobIds.has(job.id)
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
                        <span
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: colorFor(job.company) }}
                        >
                          {initials(job.company)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-gray-900 truncate">
                            {job.favorite && <span className="text-amber-400">★ </span>}{job.company}
                          </span>
                          <span className="block text-xs text-gray-400 truncate">{job.position}</span>
                        </span>
                        {typeof job.score === 'number' && (
                          <span className="text-xs font-bold text-gray-500 tabular-nums shrink-0">{job.score}</span>
                        )}
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${status?.color || 'bg-gray-100 text-gray-500'}`}>
                          {getStatusLabel(job.status, t)}
                        </span>
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
          <aside className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[440px] bg-white border-l border-gray-100 shadow-2xl flex flex-col animate-slide-up md:animate-none">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-800 truncate">{openJob.company}</span>
              <button
                onClick={close}
                aria-label={t('common.close') || 'Fermer'}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <JobCard
                variant="sheet"
                defaultExpanded
                job={openJob}
                onEdit={onEdit}
                onDelete={(j) => { close(); onDelete?.(j) }}
                onStatusChange={onStatusChange}
                onAddStep={onAddStep}
                onUpdateHistory={onUpdateHistory}
                onUpdateJob={onUpdateJob}
                onGenerateCV={onGenerateCV}
                onViewSavedCV={onViewSavedCV}
                onToggleFavorite={onToggleFavorite}
                checkAllPositions={checkAllPositions}
                t={t}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
