import { STATUSES } from '../hooks/useJobs'

export default function Filters({ filters, onChange, onReset, total, filtered }) {
  const hasActive = filters.search || filters.statuses.length > 0 || filters.period !== 'all'

  const toggleStatus = (key) => {
    const next = filters.statuses.includes(key)
      ? filters.statuses.filter(s => s !== key)
      : [...filters.statuses, key]
    onChange({ ...filters, statuses: next })
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Entreprise ou poste..."
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
          />
        </div>
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
          const active = filters.statuses.includes(s.key)
          return (
            <button key={s.key} onClick={() => toggleStatus(s.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                ${active ? s.color + ' border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? s.dot : 'bg-gray-300'}`} />
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
