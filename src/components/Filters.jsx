import { useState } from 'react'
import { STATUSES, getStatusLabel } from '../hooks/useJobs'
import BottomSheet from './BottomSheet'

export default function Filters({ filters, onChange, onReset, total, filtered, showFavOnly, onToggleFav, favCount, showArchived, onToggleArchived, archivedCount, view, onViewChange, t = (key) => key }) {
  const statusEntries = Object.entries(filters.statuses || {})
  const hasActive = filters.search || statusEntries.length > 0 || filters.period !== 'all'
  const [sheetOpen, setSheetOpen] = useState(false)

  // Count of active facets (excluding free-text search) — drives the mobile badge
  const activeCount = statusEntries.length + (filters.period !== 'all' ? 1 : 0) + (showFavOnly ? 1 : 0) + (showArchived ? 1 : 0)

  // Cycle: undefined → include → exclude → undefined
  const cycleStatus = (key) => {
    const current = (filters.statuses || {})[key]
    const next = { ...filters.statuses }
    if (!current) {
      next[key] = 'include'         // 1st click: show only
    } else if (current === 'include') {
      next[key] = 'exclude'         // 2nd click: hide
    } else {
      delete next[key]              // 3rd click: reset
    }
    onChange({ ...filters, statuses: next })
  }

  const StatusChip = ({ s }) => {
    const state = (filters.statuses || {})[s.key]
    return (
      <button
        onClick={() => cycleStatus(s.key)}
        title={!state ? t('filtersStatus.tooltip1') : state === 'include' ? t('filtersStatus.show') : t('filtersStatus.hidden')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all select-none whitespace-nowrap
          ${state === 'include'
            ? s.color + ' border-transparent shadow-sm'
            : state === 'exclude'
            ? 'bg-red-50 border-red-200 text-red-400 line-through opacity-60'
            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          state === 'include' ? s.dot : state === 'exclude' ? 'bg-red-300' : 'bg-gray-300'
        }`} />
        {getStatusLabel(s.key, t)}
        {state === 'include' && <span className="text-[10px] opacity-70">✓</span>}
        {state === 'exclude' && <span className="text-[10px]">✕</span>}
      </button>
    )
  }

  return (
    <>
    {/* ── Mobile: sticky search + Filters sheet ──────────────────────────────── */}
    <div className="sm:hidden mb-4 space-y-2.5">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder={t('filtersSearch.placeholder')}
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
          />
          {filters.search && (
            <button onClick={() => onChange({ ...filters, search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">✕</button>
          )}
        </div>
        <button onClick={() => setSheetOpen(true)}
          className={`relative flex items-center gap-1.5 px-3.5 rounded-xl text-sm font-medium border transition-all ${
            activeCount > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'
          }`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
          {activeCount > 0 && <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center">{activeCount}</span>}
        </button>
      </div>

      {/* Quick scrollable status chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 pb-0.5">
        {STATUSES.map(s => <StatusChip key={s.key} s={s} />)}
      </div>
    </div>

    {/* ── Mobile filter sheet ────────────────────────────────────────────────── */}
    <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('filtersSearch.filtersTitle') || 'Filtres'} subtitle={`${filtered} ${t('filtersSearch.of')} ${total}`}>
      <div className="space-y-5">
        {/* Status */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('jobActions.status')}</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => <StatusChip key={s.key} s={s} />)}
          </div>
        </div>
        {/* Period */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t('jobActions.date')}</p>
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            {[['all', t('filtersPeriod.all')], ['week', t('filtersPeriod.week')], ['month', t('filtersPeriod.month')]].map(([val, label]) => (
              <button key={val} onClick={() => onChange({ ...filters, period: val })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${filters.period === val ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Toggles */}
        <div className="flex gap-2">
          {onToggleFav && (
            <button onClick={onToggleFav}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${showFavOnly ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-500'}`}>
              <span>{showFavOnly ? '⭐' : '☆'}</span>{t('stats.favorites') || 'Favoris'}{favCount > 0 && ` (${favCount})`}
            </button>
          )}
          {onToggleArchived && (
            <button onClick={onToggleArchived}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${showArchived ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-500'}`}>
              <span>📦</span>{t('jobActions.archive') || 'Archives'}{archivedCount > 0 && ` (${archivedCount})`}
            </button>
          )}
        </div>
        {/* View toggle */}
        {onViewChange && (
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            {[['table', '☰ ' + (t('view.table') || 'Table')], ['kanban', '▦ ' + (t('view.kanban') || 'Kanban')], ['platforms', '🌐 ' + (t('view.platforms') || 'Platforms')]].map(([val, label]) => (
              <button key={val} onClick={() => onViewChange(val)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${view === val ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          {hasActive && (
            <button onClick={() => { onReset(); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">
              {t('filtersSearch.reset')}
            </button>
          )}
          <button onClick={() => setSheetOpen(false)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            {t('common.ok')} · {filtered}
          </button>
        </div>
      </div>
    </BottomSheet>

    {/* ── Desktop filter bar (sm+) ───────────────────────────────────────────── */}
    <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
      {/* Row 1 — search + a single cohesive controls cluster on the right */}
      <div className="flex flex-wrap items-center gap-2.5 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder={t('filtersSearch.placeholder')}
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
          />
          {filters.search && (
            <button
              onClick={() => onChange({ ...filters, search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >✕</button>
          )}
        </div>

        {/* View switcher */}
        {onViewChange && (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {[['table', '☰', t('view.table') || 'Table'], ['kanban', '▦', t('view.kanban') || 'Kanban'], ['platforms', '🌐', t('view.platforms') || 'Platforms']].map(([val, icon, label]) => (
              <button
                key={val}
                onClick={() => onViewChange(val)}
                title={label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === val ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{icon}</span>
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Period */}
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={filters.period}
          onChange={e => onChange({ ...filters, period: e.target.value })}
        >
          <option value="all">{t('filtersPeriod.all')}</option>
          <option value="week">{t('filtersPeriod.week')}</option>
          <option value="month">{t('filtersPeriod.month')}</option>
        </select>

        <div className="h-6 w-px bg-gray-200" />

        {/* Favoris + Archives toggles */}
        {onToggleFav && (
          <button
            onClick={onToggleFav}
            title={t('stats.favorites') || 'Favoris'}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium border transition-all ${
              showFavOnly ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{showFavOnly ? '⭐' : '☆'}</span>
            {favCount > 0 && <span className="text-xs">{favCount}</span>}
          </button>
        )}
        {onToggleArchived && (
          <button
            onClick={onToggleArchived}
            title={t('jobActions.archive') || 'Archives'}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium border transition-all ${
              showArchived ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>📦</span>
            {archivedCount > 0 && <span className="text-xs">{archivedCount}</span>}
          </button>
        )}

        {/* Count pill + reset */}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1.5 whitespace-nowrap">
          <span className="font-semibold text-gray-700">{filtered}</span>
          <span className="text-gray-300">/</span>
          {total}
        </span>
        {hasActive && (
          <button onClick={onReset} className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap">
            {t('filtersSearch.reset')}
          </button>
        )}
      </div>

      {/* Row 2 — status chips */}
      <div className="flex flex-wrap gap-2 px-3 pt-3 pb-3 border-t border-gray-100 bg-gray-50/40">
        {STATUSES.map(s => <StatusChip key={s.key} s={s} />)}
      </div>
    </div>
    </>
  )
}
