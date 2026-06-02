import { STATUSES } from '../hooks/useJobs'

export default function Stats({ jobs }) {
  const total = jobs.length
  const responses = jobs.filter(j => ['interview', 'offer', 'rejected'].includes(j.status)).length
  const responseRate = total > 0 ? Math.round((responses / total) * 100) : 0
  const thisWeek = jobs.filter(j => {
    const d = new Date(j.date)
    const now = new Date()
    const diff = (now - d) / (1000 * 60 * 60 * 24)
    return diff <= 7
  }).length

  const byStatus = STATUSES.map(s => ({
    ...s,
    count: jobs.filter(j => j.status === s.key).length
  })).filter(s => s.count > 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="text-2xl font-bold text-gray-800">{total}</div>
        <div className="text-sm text-gray-500 mt-1">Total candidatures</div>
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="text-2xl font-bold text-indigo-600">{thisWeek}</div>
        <div className="text-sm text-gray-500 mt-1">Cette semaine</div>
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="text-2xl font-bold text-green-600">{responseRate}%</div>
        <div className="text-sm text-gray-500 mt-1">Taux de réponse</div>
        {total < 3 && <div className="text-xs text-orange-400 mt-1">⚠ Échantillon faible</div>}
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="text-sm text-gray-500 mb-2">Par statut</div>
        <div className="flex flex-col gap-1">
          {byStatus.length === 0 && <span className="text-xs text-gray-400">—</span>}
          {byStatus.map(s => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <span className="text-xs text-gray-600 truncate">{s.label}</span>
              <span className="text-xs font-semibold text-gray-800 ml-auto">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
