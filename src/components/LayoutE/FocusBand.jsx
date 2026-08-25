// FocusBand — the calm "needs you today" strip at the top of the E home.
//
// Reuses NextAction's rules engine (buildAllActions) so the focus cards stay in
// lockstep with the "Prochaines étapes" list. Shows up to 3 top actions and
// renders NOTHING when the user is caught up (auto-hide → the list gets the space).
import { buildAllActions, loadDismissed } from '../NextAction'

const TINT = {
  cv: 'bg-violet-100 text-violet-700',
  prep: 'bg-indigo-100 text-indigo-700',
  email: 'bg-blue-100 text-blue-700',
  default: 'bg-amber-100 text-amber-700',
}

export default function FocusBand({ jobs = [], userName, onOpenJob, onGenerateCV, onSTAR, t = (k) => k }) {
  const activeJobs = jobs.filter(j => !['cancelled', 'archived'].includes(j.status))
  const actions = buildAllActions(activeJobs, {}, t, loadDismissed())
  if (actions.length === 0) return null // caught up — hide entirely

  const top = actions.slice(0, 3)
  const urgent = actions.filter(a => a.urgency === 'high').length

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">
          {userName ? `${userName} 👋` : '👋'}
        </h2>
        <span className="text-sm text-gray-400">
          · {actions.length} {t('nextAction.title')}
        </span>
        {urgent > 0 && (
          <span className="text-[11px] bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
            {urgent} urgent
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {top.map(({ job, rule, type }, i) => (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => onOpenJob?.(job)}
            onKeyDown={e => { if (e.key === 'Enter') onOpenJob?.(job) }}
            className="flex flex-col gap-2.5 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer"
          >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${TINT[rule.type] || TINT.default}`}>
              {rule.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-snug">{rule.label(job)}</p>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{rule.tip(job)}</p>
            </div>
            {rule.type === 'cv' && onGenerateCV && (
              <button
                onClick={e => { e.stopPropagation(); onGenerateCV(job) }}
                className="self-start text-xs font-semibold bg-violet-500 text-white px-3 py-1.5 rounded-lg hover:bg-violet-600 transition-colors"
              >
                {rule.cta}
              </button>
            )}
            {rule.type === 'prep' && !rule.label(job).toLowerCase().includes('test') && onSTAR && (
              <button
                onClick={e => { e.stopPropagation(); onSTAR(job) }}
                className="self-start text-xs font-semibold bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600 transition-colors"
              >
                STAR ✦
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
