// Smart "What's next" panel - shows recommended next action per job
import { getStatus } from '../hooks/useJobs'

const ACTIONS = {
  sent: {
    icon: '⏳',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badge: 'bg-blue-100 text-blue-700',
    getAction: (job, daysSince) => {
      if (daysSince > 14) return {
        label: 'Relancer',
        tip: `Aucune réponse depuis ${Math.round(daysSince)} jours. Envoie un email de relance poli.`,
        urgent: true
      }
      return {
        label: 'En attente',
        tip: `Candidature envoyée il y a ${Math.round(daysSince)} jour${daysSince > 1 ? 's' : ''}. Attends une réponse sous 2 semaines.`,
        urgent: false
      }
    }
  },
  reviewing: {
    icon: '👀',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    badge: 'bg-yellow-100 text-yellow-700',
    getAction: (job, daysSince) => {
      if (daysSince > 7) return {
        label: 'Relancer',
        tip: `Ton profil est en cours d'examen depuis ${Math.round(daysSince)} jours. Envisage une relance douce.`,
        urgent: daysSince > 14
      }
      return {
        label: 'Patienter',
        tip: 'Ton profil est en cours d\'examen. Laisse encore quelques jours avant de relancer.',
        urgent: false
      }
    }
  },
  interview: {
    icon: '📋',
    color: 'bg-purple-50 border-purple-200 text-purple-800',
    badge: 'bg-purple-100 text-purple-700',
    getAction: (job) => {
      const nextEvent = (job.history || []).find(h => h.isUpcoming)
      if (nextEvent) return {
        label: 'Préparer',
        tip: `Entretien à venir le ${nextEvent.date}. Prépare tes réponses STAR et tes questions.`,
        urgent: true,
        link: nextEvent.meetingLink,
        linkLabel: `${nextEvent.meetingEmoji || '📹'} Rejoindre ${nextEvent.meetingPlatform || 'la visio'}`
      }
      return {
        label: 'Préparer l\'entretien',
        tip: 'Prépare tes réponses STAR, recherche l\'entreprise et prépare 3-5 questions à poser.',
        urgent: false
      }
    }
  },
  waiting: {
    icon: '🔔',
    color: 'bg-orange-50 border-orange-200 text-orange-800',
    badge: 'bg-orange-100 text-orange-700',
    getAction: (job, daysSince) => {
      if (daysSince > 10) return {
        label: 'Relancer',
        tip: `En attente depuis ${Math.round(daysSince)} jours. Un email de suivi est approprié.`,
        urgent: true
      }
      return {
        label: 'Attendre',
        tip: 'Décision en cours. Reste disponible et vérifie tes emails régulièrement.',
        urgent: false
      }
    }
  },
  offer: {
    icon: '🎉',
    color: 'bg-green-50 border-green-200 text-green-800',
    badge: 'bg-green-100 text-green-700',
    getAction: (job, daysSince) => ({
      label: 'Négocier / Accepter',
      tip: 'Tu as une offre ! Prends le temps de négocier le salaire et les conditions avant d\'accepter.',
      urgent: daysSince > 5
    })
  },
  rejected: {
    icon: '💌',
    color: 'bg-gray-50 border-gray-200 text-gray-600',
    badge: 'bg-gray-100 text-gray-500',
    getAction: () => ({
      label: 'Demander un retour',
      tip: 'Envoie un email remerciant le recruteur et demandant un feedback constructif.',
      urgent: false
    })
  },
  rejected_ats: {
    icon: '🤖',
    color: 'bg-rose-50 border-rose-200 text-rose-700',
    badge: 'bg-rose-100 text-rose-600',
    getAction: () => ({
      label: 'Optimiser ton CV',
      tip: 'Refus ATS automatique. Optimise ton CV avec les mots-clés de l\'offre pour passer le filtre.',
      urgent: false
    })
  },
  cancelled: null
}

function daysSinceLastUpdate(job) {
  const date = new Date(job.updatedAt || job.date)
  return (new Date() - date) / (1000 * 60 * 60 * 24)
}

export default function NextAction({ jobs }) {
  // Only show jobs that need attention (not cancelled/rejected with no action)
  const actionable = jobs
    .filter(j => j.status !== 'cancelled')
    .map(j => {
      const config = ACTIONS[j.status]
      if (!config) return null
      const days = daysSinceLastUpdate(j)
      const action = config.getAction(j, days)
      return { job: j, config, action, days }
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Sort: urgent first, then by days since update desc
      if (a.action.urgent && !b.action.urgent) return -1
      if (!a.action.urgent && b.action.urgent) return 1
      return b.days - a.days
    })
    .slice(0, 5) // Show top 5

  if (actionable.length === 0) return null

  const urgent = actionable.filter(a => a.action.urgent)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">⚡</span>
          <h3 className="text-sm font-semibold text-gray-800">Actions recommandées</h3>
          {urgent.length > 0 && (
            <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">
              {urgent.length} urgent{urgent.length > 1 ? 'es' : 'e'}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{actionable.length} candidature{actionable.length > 1 ? 's' : ''}</span>
      </div>

      <div className="divide-y divide-gray-50">
        {actionable.map(({ job, config, action }) => (
          <div key={job.id} className={`flex items-start gap-3 px-4 py-3 ${action.urgent ? 'bg-red-50/30' : ''}`}>
            <span className="text-base mt-0.5 flex-shrink-0">{config.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-800">{job.company}</span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500 truncate">{job.position}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-auto flex-shrink-0 ${config.badge}`}>
                  {action.urgent && '🔴 '}{action.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{action.tip}</p>
              {action.link && (
                <a
                  href={action.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 px-2.5 py-1 rounded-lg transition-colors"
                >
                  {action.linkLabel} ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
