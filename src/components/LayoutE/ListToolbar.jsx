// ListToolbar — the reworked filter / search / view-switch bar for the E home.
//
// Cleaner than the classic dense Filters bar: one search field, a period + sort
// dropdown, an icon segmented view switch, and simple single-click status chips
// (click = include, click again = clear — no confusing tri-state). Drives the
// same `filters` / `sort` / showFav / showArchived / view state the classic
// tracker uses, so the shared `filtered` useMemo keeps working unchanged.
import { STATUSES, getStatusLabel } from '../../hooks/useJobs'

const VIEWS = [
  { id: 'table', icon: '☰', key: 'view.table' },
  { id: 'kanban', icon: '▦', key: 'view.kanban' },
  { id: 'platforms', icon: '⬡', key: 'view.platforms' },
]

export default function ListToolbar({
  filters,
  onChange,
  sort,
  onSort,
  view = 'table',
  onViewChange,
  showFavOnly,
  onToggleFav,
  favCount = 0,
  showArchived,
  onToggleArchived,
  archivedCount = 0,
  total = 0,
  filteredCount = 0,
  onReset,
  t = (k) => k,
}) {
  const statuses = filters?.statuses || {}
  const active = Object.entries(statuses).filter(([, v]) => v === 'include').map(([k]) => k)
  const toggleStatus = (key) =>
    onChange({ ...filters, statuses: { ...statuses, [key]: statuses[key] === 'include' ? undefined : 'include' } })
  const setSearch = (v) => onChange({ ...filters, search: v })
  const setPeriod = (v) => onChange({ ...filters, period: v })

  const dateLabel = t('jobActions.date')
  const SORTS = [
    { id: 'date_desc', label: `${dateLabel} ↓`, col: 'date', dir: 'desc' },
    { id: 'date_asc', label: `${dateLabel} ↑`, col: 'date', dir: 'asc' },
    { id: 'company_asc', label: 'A–Z', col: 'company', dir: 'asc' },
    { id: 'score_desc', label: 'Score ↓', col: 'score', dir: 'desc' },
  ]
  const sortId = SORTS.find(s => s.col === sort?.col && s.dir === sort?.dir)?.id || 'date_desc'

  const hasFilter = !!(filters?.search || active.length || showFavOnly || showArchived || (filters?.period && filters.period !== 'all'))

  const selectCls =
    'appearance-none text-sm rounded-xl border border-gray-200 bg-white pl-3 pr-7 py-2 font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer'

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* Row 1 — search · period · sort · view */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeWidth="2" /><path strokeLinecap="round" strokeWidth="2" d="M21 21l-4-4" />
          </svg>
          <input
            value={filters?.search || ''}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('filtersSearch.placeholder')}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {filters?.search && (
            <button onClick={() => setSearch('')} aria-label="clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
          )}
        </div>

        <div className="flex-1 hidden lg:block" />

        <div className="relative">
          <select value={filters?.period || 'all'} onChange={e => setPeriod(e.target.value)} className={selectCls}>
            <option value="all">{t('filtersPeriod.all')}</option>
            <option value="week">{t('filtersPeriod.week')}</option>
            <option value="month">{t('filtersPeriod.month')}</option>
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
        </div>

        <div className="relative">
          <select
            value={sortId}
            onChange={e => { const s = SORTS.find(x => x.id === e.target.value); onSort?.({ col: s.col, dir: s.dir }) }}
            className={selectCls}
          >
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
        </div>

        <div className="flex bg-gray-100 rounded-xl p-1">
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => onViewChange?.(v.id)}
              title={t(v.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === v.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{v.icon}</span><span className="hidden md:inline">{t(v.key)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Row 2 — status chips · favorites · archived · reset · count */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
          {STATUSES.filter(s => s.key !== 'archived').map(s => {
            const on = active.includes(s.key)
            return (
              <button
                key={s.key}
                onClick={() => toggleStatus(s.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
                  on ? s.color + ' border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {getStatusLabel(s.key, t)}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        <button
          onClick={onToggleFav}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
            showFavOnly ? 'bg-amber-100 text-amber-700 border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <span className="text-amber-400">★</span><span className="hidden sm:inline">{t('stats.favorites')}</span>
          {favCount > 0 && <span className="opacity-60 tabular-nums">{favCount}</span>}
        </button>

        <button
          onClick={onToggleArchived}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
            showArchived ? 'bg-slate-200 text-slate-700 border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          📦 <span className="hidden sm:inline">{t('jobActions.archive')}</span>
          {archivedCount > 0 && <span className="opacity-60 tabular-nums">{archivedCount}</span>}
        </button>

        {hasFilter && (
          <button onClick={onReset} className="text-xs text-indigo-600 hover:underline font-medium px-1 whitespace-nowrap">
            {t('filtersSearch.reset')}
          </button>
        )}
        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{filteredCount} {t('filtersSearch.of')} {total}</span>
      </div>
    </div>
  )
}
