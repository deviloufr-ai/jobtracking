import { STATUSES } from '../hooks/useJobs'

export default function Filters({ filters, onChange, onReset, total, filtered, showFavOnly, onToggleFav, favCount, showArchived, onToggleArchived, archivedCount }) {
  const statusEntries = Object.entries(filters.statuses || {})
  const hasActive = filters.search || statusEntries.length > 0 || filters.period !== 'all'

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

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Entreprise ou poste..."
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
        {/* Favoris + Archives toggles */}
        {onToggleFav && (
          <button
            onClick={onToggleFav}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
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
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              showArchived ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>📦</span>
            {archivedCount > 0 && <span className="text-xs">{archivedCount}</span>}
          </button>
        )}

        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={filters.period}
          onChange={e => onChange({ ...filters, period: e.target.value })}
        >
          <option value="all">Toutes les périodes</option>
          <option value="week">Cette semaine</option>
          <option value="month">Ce mois</option>
        </select>
        {hasActive && (
          <button onClick={onReset} className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap">
            Réinitialiser
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
          {filtered} / {total} candidature{total > 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {STATUSES.map(s => {
          const state = (filters.statuses || {})[s.key] // undefined | 'include' | 'exclude'
          return (
            <button
              key={s.key}
              onClick={() => cycleStatus(s.key)}
              title={!state ? '1× afficher · 2× masquer · 3× reset' : state === 'include' ? 'Affichage — cliquer pour masquer' : 'Masqué — cliquer pour reset'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all select-none
                ${state === 'include'
                  ? s.color + ' border-transparent shadow-sm'
                  : state === 'exclude'
                  ? 'bg-red-50 border-red-200 text-red-400 line-through opacity-60'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                state === 'include' ? s.dot
                : state === 'exclude' ? 'bg-red-300'
                : 'bg-gray-300'
              }`} />
              {s.label}
              {state === 'include' && <span className="text-[10px] opacity-70">✓</span>}
              {state === 'exclude' && <span className="text-[10px]">✕</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
