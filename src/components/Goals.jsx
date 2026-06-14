import { useState, useMemo } from 'react'
import { useSettings } from '../hooks/useSettings'

function ProgressBar({ value, max, color = 'bg-indigo-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const done = pct >= 100
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function Goals({ jobs, t = (key) => key }) {
  const { settings, updateSettings } = useSettings()
  const goals = { weeklyApps: settings.weeklyApps, responseRate: settings.responseRate, monthlyInterviews: settings.monthlyInterviews }
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goals)

  const stats = useMemo(() => {
    const now = new Date()

    // Candidatures this week (calendar week: Monday-Sunday, resets each Monday)
    const getWeekStart = () => {
      const date = new Date(now)
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is Sunday
      const weekStart = new Date(date.setDate(diff))
      weekStart.setHours(0, 0, 0, 0)
      return weekStart
    }
    const weekStart = getWeekStart()
    const weeklyApps = jobs.filter(j => new Date(j.date) >= weekStart).length

    // Response rate (non-archived)
    const active = jobs.filter(j => j.status !== 'archived')
    const responded = active.filter(j => ['interview','offer','rejected','rejected_ats','done','waiting'].includes(j.status)).length
    const responseRate = active.length > 0 ? Math.round((responded / active.length) * 100) : 0

    // Interviews this month
    const monthlyInterviews = jobs.filter(j => {
      const diff = (now - new Date(j.date)) / 86400000
      return diff <= 30 && ['interview','done'].includes(j.status)
    }).length

    return { weeklyApps, responseRate, monthlyInterviews }
  }, [jobs])

  const handleSave = () => {
    updateSettings(draft)
    setEditing(false)
  }

  const items = [
    {
      label: t('goals.applicationsPerWeek'),
      value: stats.weeklyApps,
      target: goals.weeklyApps,
      unit: t('goals.thisWeek'),
      color: 'bg-indigo-500',
      icon: '📨',
      key: 'weeklyApps',
    },
    {
      label: t('goals.responseRate'),
      value: stats.responseRate,
      target: goals.responseRate,
      unit: '% actuel',
      color: 'bg-teal-500',
      icon: '📊',
      key: 'responseRate',
      isPercent: true,
    },
    {
      label: t('goals.interviewsPerMonth'),
      value: stats.monthlyInterviews,
      target: goals.monthlyInterviews,
      unit: 'ce mois',
      color: 'bg-purple-500',
      icon: '🎯',
      key: 'monthlyInterviews',
    },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        <span className="text-base">🏆</span>
        <h3 className="text-sm font-semibold text-gray-800">{t('goals.title')}</h3>
        <button
          onClick={() => { setDraft(goals); setEditing(v => !v) }}
          className="ml-auto text-xs text-gray-400 hover:text-indigo-500 transition-colors"
          title="Modifier les objectifs"
        >
          {editing ? '✕' : '✏️'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {items.map(item => {
          const pct = item.target > 0 ? Math.min(Math.round((item.value / item.target) * 100), 100) : 0
          const done = pct >= 100
          return (
            <div key={item.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-xs font-medium text-gray-700">{item.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {done && <span className="text-[10px] text-green-600 font-semibold">✓ Atteint !</span>}
                  <span className="text-xs font-bold text-gray-800">
                    {item.isPercent ? `${item.value}%` : item.value}
                    <span className="text-gray-400 font-normal"> / {item.isPercent ? `${item.target}%` : item.target}</span>
                  </span>
                </div>
              </div>
              <ProgressBar value={item.value} max={item.target} color={item.color} />
              <p className="text-[10px] text-gray-400 mt-0.5">{item.unit}</p>

              {editing && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">Objectif :</span>
                  <input
                    type="number"
                    min="1"
                    value={draft[item.key]}
                    onChange={e => setDraft(d => ({ ...d, [item.key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-16 text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                  {item.isPercent && <span className="text-[10px] text-gray-400">%</span>}
                </div>
              )}
            </div>
          )
        })}

        {editing && (
          <button
            onClick={handleSave}
            className="w-full text-xs bg-indigo-600 text-white py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Sauvegarder
          </button>
        )}
      </div>
    </div>
  )
}
