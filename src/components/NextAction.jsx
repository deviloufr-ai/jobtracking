import { getStatus } from '../hooks/useJobs'

function daysSince(job) {
  return (new Date() - new Date(job.updatedAt || job.date)) / (1000 * 60 * 60 * 24)
}

// Urgent actions - things that need attention NOW
const URGENT_RULES = [
  {
    match: j => j.status === 'sent' && daysSince(j) > 14,
    icon: '📨', urgency: 'high',
    label: job => `Relancer ${job.company}`,
    tip: job => `Aucune réponse depuis ${Math.round(daysSince(job))} jours. Un email de relance s'impose.`,
  },
  {
    match: j => j.status === 'reviewing' && daysSince(j) > 10,
    icon: '📨', urgency: 'medium',
    label: job => `Relancer ${job.company}`,
    tip: job => `Profil en examen depuis ${Math.round(daysSince(job))} jours sans retour.`,
  },
  {
    match: j => j.status === 'waiting' && daysSince(j) > 7,
    icon: '🔔', urgency: 'high',
    label: job => `Suivi ${job.company}`,
    tip: job => `En attente depuis ${Math.round(daysSince(job))} jours — relance appropriée.`,
  },
  {
    match: j => j.status === 'offer' && daysSince(j) > 3,
    icon: '🤝', urgency: 'high',
    label: job => `Répondre à l'offre ${job.company}`,
    tip: () => `Offre reçue — négocie et réponds avant qu'elle expire.`,
  },
  {
    match: j => j.status === 'interview',
    icon: '🎯', urgency: 'medium',
    label: job => `Préparer entretien ${job.company}`,
    tip: () => `Prépare tes réponses STAR, recherche l'entreprise, prépare 5 questions.`,
  },
  {
    match: j => ['rejected', 'rejected_ats'].includes(j.status) && daysSince(j) < 7,
    icon: '💌', urgency: 'low',
    label: job => `Feedback ${job.company}`,
    tip: () => `Demande un retour constructif — ça te différencie et maintient la relation.`,
  },
]

// Next steps - concrete actionable tasks
const NEXT_STEPS_RULES = [
  {
    match: j => j.status === 'todo',
    icon: '📄', type: 'cv',
    label: job => `Générer un CV pour ${job.company}`,
    tip: job => `Adapte ton CV à l'offre ${job.position} avant de postuler.`,
    cta: 'Générer le CV',
  },
  {
    match: j => j.status === 'interview',
    icon: '📋', type: 'prep',
    label: job => `Préparer le dossier ${job.company}`,
    tip: () => `Recherche l'entreprise, prépare 5 questions pertinentes, révise ton parcours STAR.`,
    cta: 'Voir les conseils',
  },
  {
    match: j => j.status === 'sent' && daysSince(j) > 14,
    icon: '✉️', type: 'email',
    label: job => `Rédiger relance ${job.company}`,
    tip: () => `Email de relance poli : rappel de ta candidature + réaffirmation de ton intérêt.`,
    cta: 'Rédiger l\'email',
  },
  {
    match: j => j.status === 'offer',
    icon: '💰', type: 'negotiate',
    label: job => `Préparer négociation ${job.company}`,
    tip: () => `Salaire, télétravail, avantages, date de prise de poste — prépare chaque point.`,
    cta: 'Voir les conseils',
  },
  {
    match: j => j.status === 'rejected_ats',
    icon: '🔧', type: 'cv',
    label: job => `Optimiser CV pour ${job.company}`,
    tip: () => `Refus ATS — intègre les mots-clés de l'offre et restructure ton CV.`,
    cta: 'Optimiser le CV',
  },
]

const URGENCY_COLORS = {
  high:   'border-l-red-400 bg-red-50/40',
  medium: 'border-l-orange-300 bg-orange-50/40',
  low:    'border-l-blue-300 bg-blue-50/40',
}

export default function NextAction({ jobs, onGenerateCV, onOpenJob }) {
  const activeJobs = jobs.filter(j => !['cancelled', 'archived'].includes(j.status))

  const urgentActions = activeJobs
    .flatMap(job => URGENT_RULES
      .filter(r => r.match(job))
      .map(r => ({ job, rule: r }))
    )
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.rule.urgency] - order[b.rule.urgency]
    })
    .slice(0, 4)

  const nextSteps = activeJobs
    .flatMap(job => NEXT_STEPS_RULES
      .filter(r => r.match(job))
      .map(r => ({ job, rule: r }))
    )
    .slice(0, 4)

  if (urgentActions.length === 0 && nextSteps.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      {/* Urgent Actions */}
      {urgentActions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <span className="text-base">⚡</span>
            <h3 className="text-sm font-semibold text-gray-800">Actions requises</h3>
            {urgentActions.filter(a => a.rule.urgency === 'high').length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full ml-auto">
                {urgentActions.filter(a => a.rule.urgency === 'high').length} urgent{urgentActions.filter(a => a.rule.urgency === 'high').length > 1 ? 'es' : 'e'}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {urgentActions.map(({ job, rule }, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 border-l-4 ${URGENCY_COLORS[rule.urgency]}`}>
                <span className="text-base mt-0.5 flex-shrink-0">{rule.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{rule.label(job)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rule.tip(job)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <span className="text-base">🗺️</span>
            <h3 className="text-sm font-semibold text-gray-800">Prochaines étapes</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {nextSteps.map(({ job, rule }, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                <span className="text-base mt-0.5 flex-shrink-0">{rule.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{rule.label(job)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rule.tip(job)}</p>
                </div>
                {rule.type === 'cv' && onGenerateCV && (
                  <button
                    onClick={() => onGenerateCV(job)}
                    className="flex-shrink-0 text-xs font-medium bg-violet-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-violet-600 transition-colors whitespace-nowrap"
                  >
                    {rule.cta}
                  </button>
                )}
                {rule.type === 'usecase' && (
                  <button
                    onClick={() => onOpenJob && onOpenJob(job)}
                    className="flex-shrink-0 text-xs font-medium bg-amber-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-amber-600 transition-colors whitespace-nowrap"
                  >
                    {rule.cta}
                  </button>
                )}
                {!['cv', 'usecase'].includes(rule.type) && (
                  <button
                    onClick={() => onOpenJob && onOpenJob(job)}
                    className="flex-shrink-0 text-xs font-medium border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    {rule.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
        {nextSteps.length === 0 && (
          <div className="px-4 py-6 text-center text-gray-400">
            <p className="text-sm">✅ Aucune étape prioritaire pour l'instant</p>
          </div>
        )}
      </div>
    </div>
  )
}
