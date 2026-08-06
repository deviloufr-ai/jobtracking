import { useMemo } from 'react'
import { responseRate as computeResponseRate, mondayOf } from '../utils/metrics'

// Slim desktop KPI bar — replaces the four heavy Stats cards on the tracker home
// so the action list and the candidatures rise above the fold. Numbers use the
// canonical metrics module (utils/metrics) so they match the Analyse tab.
export default function KpiStrip({ jobs, t = (k) => k }) {
  const kpis = useMemo(() => {
    const active = jobs.filter(j => j.status !== 'archived').length
    const interviews = jobs.filter(j => j.status === 'interview').length
    const offers = jobs.filter(j => j.status === 'offer').length
    const weekStart = mondayOf(new Date())
    const thisWeek = jobs.filter(j => new Date(j.date) >= weekStart).length
    return [
      { key: 'active', value: active, label: t('statsResponse.active') },
      { key: 'interviews', value: interviews, label: t('statsPipeline.interviews') },
      { key: 'offers', value: offers, label: t('statsPipeline.offers') },
      { key: 'response', value: `${computeResponseRate(jobs)}%`, label: t('statsResponse.title') },
      { key: 'week', value: thisWeek, label: t('statsActivity.thisWeek') },
    ]
  }, [jobs, t])

  return (
    <div className="flex items-stretch gap-1 bg-white rounded-xl shadow-sm border border-gray-100 p-1.5 overflow-x-auto no-scrollbar">
      {kpis.map((k, i) => (
        <div key={k.key} className={`flex-1 min-w-[96px] px-4 py-2.5 rounded-lg ${i > 0 ? 'border-l border-gray-50' : ''}`}>
          <div className="text-2xl font-extrabold text-gray-800 leading-none tabular-nums tracking-tight">{k.value}</div>
          <div className="text-[11px] text-gray-400 mt-1.5 font-medium">{k.label}</div>
        </div>
      ))}
    </div>
  )
}
