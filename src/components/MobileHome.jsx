import { buildAllActions, loadDismissed, runPrimaryAction } from './NextAction'
import { deriveStatusFromHistory } from '../hooks/useJobs'

const isEN = typeof navigator !== 'undefined' && navigator.language.startsWith('en')

/**
 * Mobile "Accueil" hero — the action-first home shown above the list on phones.
 * Surfaces the single highest-priority next action (reusing the NextAction rules
 * engine) plus three at-a-glance counters, so the screen answers "what do I do
 * now?" before the user scrolls into the full list.
 */
export default function MobileHome({ jobs, userName, onOpenJob, onDraftEmail, onGenerateCV, onSTAR, t = (k) => k }) {
  // Bilingual fallback: use a real translation when present, else FR/EN default.
  const tr = (key, fr, en) => { const v = t(key); return v && v !== key ? v : (isEN ? en : fr) }

  const eff = (j) => deriveStatusFromHistory(j.history) || j.status
  const active = jobs.filter(j => !['rejected', 'rejected_ats', 'cancelled', 'archived'].includes(eff(j)))
  const interviews = jobs.filter(j => eff(j) === 'interview').length
  const offers = jobs.filter(j => eff(j) === 'offer').length

  const actions = buildAllActions(active, null, t, loadDismissed())
  const top = actions[0]

  const now = new Date()
  const dateStr = now.toLocaleDateString(isEN ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const name = userName ? `, ${userName.split(' ')[0]}` : ''

  const runCta = (job, rule) => runPrimaryAction(job, rule, { onGenerateCV, onSTAR, onDraftEmail, onOpenJob })

  const ctaLabel = (rule, job) => {
    if (rule.emailType === 'relance') return tr('flux.relance', 'Relancer', 'Follow up')
    if (rule.emailType === 'remerciement') return tr('mobileHome.thank', 'Remercier', 'Thank them')
    if (rule.type === 'cv') return rule.cta || tr('mobileHome.genCV', 'Générer un CV', 'Generate CV')
    if (rule.type === 'prep' && !rule.label(job).toLowerCase().includes('test')) return rule.cta || 'STAR ✦'
    return rule.cta || tr('mobileHome.open', 'Ouvrir', 'Open')
  }

  return (
    <div className="mb-4 space-y-3">
      <div>
        <h2 className="text-xl font-bold text-gray-900 leading-tight">{tr('mobileHome.greeting', 'Bonjour', 'Hi')}{name}</h2>
        <p className="text-xs text-gray-400 capitalize">{dateStr} · {active.length} {tr('mobileHome.activeLabel', 'actives', 'active')}</p>
      </div>

      {top && (
        <div onClick={() => onOpenJob?.(top.job)}
          className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5 active:scale-[0.99] transition-transform">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            {tr('mobileHome.priority', 'À faire en priorité', 'Top priority')}
          </span>
          <div className="flex items-start gap-2.5 mt-2">
            <span className="text-lg leading-none">{top.rule.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-snug">{top.rule.label(top.job)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{top.rule.tip(top.job)}</p>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); runCta(top.job, top.rule) }}
            className="mt-3 w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl active:scale-[0.98] transition-transform">
            {ctaLabel(top.rule, top.job)}
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          [active.length, tr('mobileHome.inProgress', 'En cours', 'In progress')],
          [interviews, tr('mobileHome.interviews', 'Entretiens', 'Interviews')],
          [offers, tr('mobileHome.offers', 'Offres', 'Offers')],
        ].map(([n, label], i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-2.5 text-center">
            <div className="text-xl font-bold text-gray-900">{n}</div>
            <div className="text-[11px] text-gray-400">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
