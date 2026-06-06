import { getStatus } from '../hooks/useJobs'
import { loadSettings } from '../hooks/useSettings'

function daysSince(job) {
  return (new Date() - new Date(job.updatedAt || job.date)) / (1000 * 60 * 60 * 24)
}

// Get the most recent non-calendar history note
function lastNote(job) {
  const hist = [...(job.history || [])].reverse()
  return (hist.find(h => h.source !== 'calendar')?.note || '').toLowerCase()
}

function hasKeyword(job, ...kws) {
  const notes = (job.history || []).map(h => (h.note || '').toLowerCase()).join(' ')
  return kws.some(k => notes.includes(k))
}

function hasUpcomingCalendar(job) {
  const today = new Date(); today.setHours(0,0,0,0)
  return (job.history || []).some(h => h.source === 'calendar' && h.isUpcoming && new Date(h.date) >= today)
}

const TEST_KWS = ['test technique', 'technical test', 'case study', 'assessment', 'exercice technique', 'mise en situation', 'lancement test', 'tech test']
const NEGO_KWS = ['négociation', 'salaire', 'rémunération', 'prétentions', 'package', 'compensation', 'offre salariale']

// Urgent actions - things that need attention NOW
function getUrgentRules() {
  const s = loadSettings()
  return [
  {
    match: j => j.status === 'sent' && daysSince(j) > s.followUpSentDays,
    icon: '📨', urgency: 'high',
    label: job => `Relancer ${job.company}`,
    tip: job => `Aucune réponse depuis ${Math.round(daysSince(job))} jours. Un email de relance s'impose.`,
  },
  {
    match: j => j.status === 'reviewing' && daysSince(j) > s.followUpReviewingDays,
    icon: '📨', urgency: 'medium',
    label: job => `Relancer ${job.company}`,
    tip: job => `Profil en examen depuis ${Math.round(daysSince(job))} jours sans retour.`,
  },
  {
    match: j => j.status === 'waiting' && daysSince(j) > s.followUpWaitingDays,
    icon: '🔔', urgency: 'high',
    label: job => `Suivi ${job.company}`,
    tip: job => `En attente depuis ${Math.round(daysSince(job))} jours — relance appropriée.`,
  },
  {
    match: j => j.status === 'offer' && daysSince(j) > s.followUpOfferDays,
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
]}

// Next steps — note-aware, contextual. Order = priority shown to user.
const NEXT_STEPS_RULES = [
  // Upcoming calendar event (test/meeting) — highest priority
  {
    match: j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status) && hasUpcomingCalendar(j) && hasKeyword(j, ...TEST_KWS),
    icon: '💻', type: 'prep',
    label: job => `Préparer le test technique ${job.company}`,
    tip: () => `Prépare la documentation, un repo propre, soigne le README et tes explications de choix techniques.`,
    cta: 'Voir les conseils',
    priority: 0,
  },
  // Tech test mentioned anywhere in history (even without calendar)
  {
    match: j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status) && hasKeyword(j, ...TEST_KWS) && !hasUpcomingCalendar(j),
    icon: '💻', type: 'prep',
    label: job => `Préparer le test technique ${job.company}`,
    tip: () => `Prépare la documentation, un repo propre, soigne le README et tes explications de choix techniques.`,
    cta: 'Voir les conseils',
    priority: 1,
  },
  // Upcoming calendar event (interview)
  {
    match: j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status) && hasUpcomingCalendar(j) && !hasKeyword(j, ...TEST_KWS),
    icon: '🎯', type: 'prep',
    label: job => `Préparer l'entretien ${job.company}`,
    tip: job => `Recherche ${job.company}, prépare 5 questions, révise tes réponses STAR et ton pitch.`,
    cta: 'Voir les conseils',
    priority: 0,
  },
  // Salary negotiation detected
  {
    match: j => !['archived','rejected','rejected_ats','cancelled','todo'].includes(j.status) && hasKeyword(j, ...NEGO_KWS),
    icon: '💰', type: 'negotiate',
    label: job => `Préparer la négociation ${job.company}`,
    tip: () => `Salaire, télétravail, avantages, date de prise de poste — prépare chaque point avec des arguments marché.`,
    cta: 'Voir les conseils',
    priority: 1,
  },
  // Interview status without test
  {
    match: j => j.status === 'interview' && !hasKeyword(j, ...TEST_KWS),
    icon: '🎯', type: 'prep',
    label: job => `Préparer l'entretien ${job.company}`,
    tip: job => `Recherche ${job.company}, prépare 5 questions, révise tes réponses STAR et ton pitch.`,
    cta: 'Voir les conseils',
    priority: 1,
  },
  // Offer received
  {
    match: j => j.status === 'offer',
    icon: '🤝', type: 'negotiate',
    label: job => `Répondre à l'offre ${job.company}`,
    tip: () => `Négocie avant d'accepter. Demande un délai de 48-72h si besoin.`,
    cta: 'Voir les conseils',
  },
  // Todo — generate CV
  {
    match: j => j.status === 'todo',
    icon: '📄', type: 'cv',
    label: job => `Générer un CV pour ${job.company}`,
    tip: job => `Adapte ton CV à l'offre ${job.position} avant de postuler.`,
    cta: 'Générer le CV',
  },
  // Follow-up overdue
  {
    match: j => j.status === 'sent' && daysSince(j) > 14,
    icon: '✉️', type: 'email',
    label: job => `Relancer ${job.company}`,
    tip: () => `Email court et poli : rappel de ta candidature + réaffirmation de ton intérêt.`,
    cta: 'Rédiger',
  },
  // Remerciement after rejection
  {
    match: j => ['rejected','rejected_ats'].includes(j.status) && daysSince(j) < 5,
    icon: '💌', type: 'email',
    label: job => `Envoyer remerciement ${job.company}`,
    tip: () => `Un email de remerciement te différencie et maintient la relation pour l'avenir.`,
    cta: 'Rédiger',
  },
]

const URGENCY_COLORS = {
  high:   'border-l-red-400 bg-red-50/40',
  medium: 'border-l-orange-300 bg-orange-50/40',
  low:    'border-l-blue-300 bg-blue-50/40',
}

export default function NextAction({ jobs, onGenerateCV, onOpenJob, onSTAR, onDraftEmail }) {
  const activeJobs = jobs.filter(j => !['cancelled', 'archived'].includes(j.status))

  const urgentActions = activeJobs
    .flatMap(job => getUrgentRules()
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
      .map(r => ({ job, rule: r, priority: r.priority ?? 2 }))
    )
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6)

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
                {rule.icon === '🎯' && onSTAR && (
                  <button onClick={() => onSTAR(job)} className="flex-shrink-0 text-xs font-medium bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap">
                    STAR ✦
                  </button>
                )}
                {rule.icon === '💌' && onDraftEmail && (
                  <button onClick={() => onDraftEmail(job, 'remerciement')} className="flex-shrink-0 text-xs font-medium bg-pink-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-pink-600 transition-colors whitespace-nowrap">
                    Rédiger ✦
                  </button>
                )}
                {rule.icon === '📨' && onDraftEmail && (
                  <button onClick={() => onDraftEmail(job, 'relance')} className="flex-shrink-0 text-xs font-medium bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap">
                    Rédiger ✦
                  </button>
                )}
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
                  <button onClick={() => onGenerateCV(job)} className="flex-shrink-0 text-xs font-medium bg-violet-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-violet-600 transition-colors whitespace-nowrap">
                    {rule.cta}
                  </button>
                )}
                {rule.type === 'prep' && onSTAR && (
                  <button onClick={() => onSTAR(job)} className="flex-shrink-0 text-xs font-medium bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap">
                    STAR ✦
                  </button>
                )}
                {rule.type === 'email' && rule.label(job).toLowerCase().includes('remerciement') && onDraftEmail && (
                  <button onClick={() => onDraftEmail(job, 'remerciement')} className="flex-shrink-0 text-xs font-medium bg-pink-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-pink-600 transition-colors whitespace-nowrap">
                    Rédiger ✦
                  </button>
                )}
                {rule.type === 'email' && rule.label(job).toLowerCase().includes('relancer') && onDraftEmail && (
                  <button onClick={() => onDraftEmail(job, 'relance')} className="flex-shrink-0 text-xs font-medium bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap">
                    Rédiger ✦
                  </button>
                )}
                {rule.type === 'usecase' && (
                  <button onClick={() => onOpenJob && onOpenJob(job)} className="flex-shrink-0 text-xs font-medium bg-amber-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-amber-600 transition-colors whitespace-nowrap">
                    {rule.cta}
                  </button>
                )}
                {!['cv', 'prep', 'email', 'usecase'].includes(rule.type) && (
                  <button onClick={() => onOpenJob && onOpenJob(job)} className="flex-shrink-0 text-xs font-medium border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
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
