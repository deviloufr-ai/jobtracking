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
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getStatus, getStatusLabel } from '../../hooks/useJobs'
import { scoreColorClasses } from '../ScoreJob'
import KanbanBoard from '../KanbanBoard'
import MobilePipeline from '../MobilePipeline'
import PlatformView from '../PlatformView'
import JobFluxRow from '../JobFluxRow'
import FocusBand from './FocusBand'
import ListToolbar from './ListToolbar'
import CandidatureDrawer from './CandidatureDrawer'

const PALETTE = ['#4f46e5', '#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#dc2626', '#059669']
const colorFor = (s = '') => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
const initials = (s = '') =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const fullDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '')

// Dynamic per-row timeline — a status-colored dot for every real step, dated
// and in chronological order. One continuous rail runs through the dots; the
// column scrolls when the journey is long and auto-scrolls to the latest step.
// Hovering a dot pops a card (status + date + note) rendered in a portal so the
// scroll container can't clip it. `width` is the shared, user-resizable column.
function StepTooltip({ hover, t }) {
  if (!hover) return null
  const above = hover.top > 160
  return createPortal(
    <div
      className="fixed z-[60] pointer-events-none"
      style={{ left: hover.x, top: above ? hover.top : hover.bottom, transform: above ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)' }}
    >
      <div className="rounded-lg bg-white border border-gray-200 shadow-xl p-2.5 w-max max-w-[260px]">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatus(hover.h.status)?.color || 'bg-gray-100 text-gray-500'}`}>
            {getStatusLabel(hover.h.status, t)}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums">{fullDate(hover.h.date)}</span>
        </div>
        {hover.h.note
          ? <p className="text-[12px] text-gray-600 whitespace-pre-line leading-snug line-clamp-6">{hover.h.note}</p>
          : <p className="text-[12px] text-gray-400 italic">No note</p>}
      </div>
    </div>,
    document.body,
  )
}

function StageBar({ history, t, width = 188, onResizeStart, onResizeReset }) {
  const steps = (history || []).filter(h => h.date)
  const scrollRef = useRef(null)
  const [hover, setHover] = useState(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [steps.length, width])
  const showStep = (e, h) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover({ h, x: r.left + r.width / 2, top: r.top, bottom: r.bottom })
  }
  return (
    <div className="hidden lg:block relative shrink-0 group/tl" style={{ width }}>
      <div ref={scrollRef} className="overflow-x-auto no-scrollbar">
        {steps.length === 0 ? (
          <div className="h-2" />
        ) : (
          <ol className="flex items-start w-max">
            {steps.map((h, i) => (
              <li
                key={i}
                className="relative shrink-0 flex flex-col items-center"
                onMouseEnter={(e) => showStep(e, h)}
                onMouseLeave={() => setHover(null)}
              >
                {/* rail: a half-segment each side of the dot; li has no side padding
                    so w-full segments meet the neighbours into one unbroken line */}
                <div className="relative h-2 w-full flex items-center justify-center">
                  {i > 0 && <span className="absolute top-1/2 -translate-y-1/2 left-0 w-1/2 h-0.5 bg-gray-200" />}
                  {i < steps.length - 1 && <span className="absolute top-1/2 -translate-y-1/2 left-1/2 w-1/2 h-0.5 bg-gray-200" />}
                  <span className={`relative z-[1] w-2 h-2 rounded-full ${getStatus(h.status)?.dot || 'bg-gray-400'}`} />
                </div>
                <span className="mt-1 px-2 text-[9px] leading-none tabular-nums text-gray-400 whitespace-nowrap">{shortDate(h.date)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {/* drag grip — resizes the shared timeline column; double-click = auto-fit */}
      {onResizeStart && (
        <span
          onMouseDown={onResizeStart}
          onDoubleClick={onResizeReset}
          onClick={(e) => e.stopPropagation()}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize · double-click to auto-fit"
          className="absolute top-1/2 -translate-y-1/2 right-0 h-6 w-1.5 rounded-full cursor-col-resize bg-gray-200 opacity-0 group-hover/tl:opacity-100 hover:bg-indigo-400 transition-colors"
        />
      )}
      <StepTooltip hover={hover} t={t} />
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

  // ── Timeline column width: shared across rows, auto-fits the data by default,
  // and drag-resizable (persisted). null = auto; a number = user-chosen. ───────
  const TL_MIN = 120, TL_MAX = 460, TL_AUTO_MAX = 240, TL_PER_STEP = 46
  const [timelineWidth, setTimelineWidth] = useState(() => {
    try { const v = localStorage.getItem('jobtrackr_timeline_col_w'); return v ? Number(v) : null } catch { return null }
  })
  const maxSteps = filtered.reduce((m, j) => Math.max(m, (j.history || []).filter(h => h.date).length), 1)
  const autoTimelineWidth = Math.max(TL_MIN, Math.min(TL_AUTO_MAX, maxSteps * TL_PER_STEP))
  const timelineColWidth = timelineWidth ?? autoTimelineWidth
  const tlDrag = useRef(null)
  const startTimelineResize = (e) => {
    e.preventDefault(); e.stopPropagation()
    tlDrag.current = { startX: e.clientX, startW: timelineColWidth, w: timelineColWidth }
    const onMove = (ev) => {
      const w = Math.max(TL_MIN, Math.min(TL_MAX, tlDrag.current.startW + (ev.clientX - tlDrag.current.startX)))
      tlDrag.current.w = w
      setTimelineWidth(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      try { localStorage.setItem('jobtrackr_timeline_col_w', String(tlDrag.current.w)) } catch {}
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const resetTimelineWidth = () => {
    setTimelineWidth(null)
    try { localStorage.removeItem('jobtrackr_timeline_col_w') } catch {}
  }

  // ── Detail drawer width: drag the drawer's left edge to resize it freely
  // (desktop), persisted; double-click the grip resets to the default. Mobile
  // stays full-screen. The list's right padding tracks the width through a CSS
  // variable so the content reflows exactly beside the drawer. ────────────────
  const DW_MIN = 420, DW_MAX = 1200
  const defaultDrawerWidth = () =>
    (typeof window !== 'undefined' && window.innerWidth >= 1536) ? 820 : 600
  const [drawerWidth, setDrawerWidth] = useState(() => {
    try { const v = localStorage.getItem('jobtrackr_drawer_w'); if (v) return Number(v) } catch {}
    return defaultDrawerWidth()
  })
  const [resizingDrawer, setResizingDrawer] = useState(false)
  const dwDrag = useRef(null)
  const startDrawerResize = (e) => {
    e.preventDefault(); e.stopPropagation()
    dwDrag.current = { startX: e.clientX, startW: drawerWidth, w: drawerWidth }
    setResizingDrawer(true)
    const onMove = (ev) => {
      const max = Math.min(DW_MAX, window.innerWidth - 320)
      // drawer is docked right → dragging left (smaller clientX) widens it
      const w = Math.max(DW_MIN, Math.min(max, dwDrag.current.startW - (ev.clientX - dwDrag.current.startX)))
      dwDrag.current.w = w
      setDrawerWidth(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setResizingDrawer(false)
      try { localStorage.setItem('jobtrackr_drawer_w', String(dwDrag.current.w)) } catch {}
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const resetDrawerWidth = () => {
    setDrawerWidth(defaultDrawerWidth())
    try { localStorage.removeItem('jobtrackr_drawer_w') } catch {}
  }

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
    <div
      className={`w-full min-w-0 ${resizingDrawer ? '' : 'transition-[padding] duration-300'} ${openJob ? 'md:pr-[var(--drawer-pad)]' : ''}`}
      style={openJob ? { '--drawer-pad': `${drawerWidth + 16}px`, '--drawer-w': `${drawerWidth}px` } : undefined}
    >
      <FocusBand
        jobs={jobs}
        userName={userName}
        onOpenJob={open}
        onGenerateCV={onGenerateCV}
        onSTAR={onSTAR}
        onDraftEmail={onDraftEmail}
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
        <>
        {/* Mobile: real cards (JobFluxRow) with the horizontal timeline —
            replaces the desktop-oriented rows, which are cramped on a phone.
            Favorites pinned to the top, matching the desktop sort. */}
        <div className="md:hidden">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-16">
              <p className="text-gray-500 font-medium">{t('empty.noResults') || t('empty.noApplications')}</p>
              {resetBtn}
            </div>
          ) : (
            <div className="space-y-2.5">
              {[...filtered].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)).map(job => (
                <JobFluxRow
                  key={job.id}
                  job={job}
                  onOpen={open}
                  onToggleFavorite={onToggleFavorite}
                  onArchive={(j) => onStatusChange?.(j.id, 'archived')}
                  onRelance={(j) => onDraftEmail?.(j, 'relance')}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        {/* Desktop/tablet: unified rows */}
        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                {/* Favorites pinned to the top; existing sort kept within each group (stable sort) */}
                {[...filtered].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)).map(job => {
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
                        <span className={`min-w-0 ${compact ? 'flex-1' : 'w-[360px] shrink-0'}`}>
                          <span className="block text-[13.5px] font-semibold tracking-tight text-gray-900 truncate">{job.company}</span>
                          <span className="block text-[12px] text-gray-400 truncate">{job.position}</span>
                        </span>
                        {!compact && <StageBar history={job.history} t={t} width={timelineColWidth} onResizeStart={startTimelineResize} onResizeReset={resetTimelineWidth} />}
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
        </>
      )}

      {/* Master-detail drawer */}
      {openJob && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={close} />
          <aside className="fixed top-0 right-0 bottom-0 z-40 w-full md:w-[var(--drawer-w)] bg-white border-l border-gray-100 shadow-2xl flex flex-col animate-slide-up md:animate-none">
            {/* resize grip — drag the drawer's left edge to resize freely
                (desktop); double-click resets to the default width */}
            <div
              onMouseDown={startDrawerResize}
              onDoubleClick={resetDrawerWidth}
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize · double-click to reset"
              className={`hidden md:flex absolute inset-y-0 left-0 -translate-x-1/2 w-3 cursor-col-resize items-center justify-center z-10 group/dw ${resizingDrawer ? 'bg-indigo-50/40' : ''}`}
            >
              <span className={`h-10 w-1 rounded-full transition-colors ${resizingDrawer ? 'bg-indigo-400' : 'bg-gray-200 group-hover/dw:bg-indigo-400'}`} />
            </div>
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
