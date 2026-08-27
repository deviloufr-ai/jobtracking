// FocusBand — the calm "needs you today" strip at the top of the E home.
//
// Reuses NextAction's rules engine (buildAllActions) so the focus cards stay in
// lockstep with the "Prochaines étapes" list. Shows up to 3 top actions and
// renders NOTHING when the user is caught up (auto-hide → the list gets the space).
import { useState } from 'react'
import { buildAllActions, loadDismissed, dismissAction } from '../NextAction'

const TINT = {
  cv: 'bg-violet-100 text-violet-700',
  prep: 'bg-indigo-100 text-indigo-700',
  email: 'bg-blue-100 text-blue-700',
  default: 'bg-amber-100 text-amber-700',
}

export default function FocusBand({ jobs = [], userName, onOpenJob, onGenerateCV, onSTAR, t = (k) => k }) {
  // Local dismissed state so hiding a focus card re-renders immediately; the
  // shared helper persists it (same store as the "Prochaines étapes" list).
  const [dismissed, setDismissed] = useState(loadDismissed)
  const remove = (job, rule) => setDismissed(dismissAction(job, rule))

  const activeJobs = jobs.filter(j => !['cancelled', 'archived'].includes(j.status))
  const actions = buildAllActions(activeJobs, {}, t, dismissed)
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
            className="group/card relative flex flex-col gap-2.5 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer"
          >
            {/* Remove — hides this action (persists like the list dismiss).
                stopPropagation so the card click still opens the job. */}
            <button
              onClick={e => { e.stopPropagation(); remove(job, rule) }}
              className="absolute top-2.5 right-2.5 opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-md"
              title={t('nextAction.dismiss')}
              aria-label={t('nextAction.dismiss')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
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
