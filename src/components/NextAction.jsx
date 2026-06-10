import { useState } from 'react'
import { getStatus } from '../hooks/useJobs'
import { loadSettings } from '../hooks/useSettings'
import { isNoReply } from './EmailDraft'

const DISMISSED_KEY = 'jobtrackr_dismissed_actions'
function loadDismissed() { try { return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() } }
function saveDismissed(s) { try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...s])) } catch {} }
function actionKey(job, rule) { return `${job.id}__${rule.label(job).slice(0, 40)}` }

// Returns true if the job has at least one real (non-ATS, non-no-reply) inbound email address
function hasRealEmail(job) {
  for (const h of (job?.history || [])) {
    if (h.fromMe || !h.from) continue
    const raw = h.from.trim()
    const angleMatch = raw.match(/<([^>]+@[^>]+)>/)
    const email = angleMatch ? angleMatch[1].trim() : (raw.includes('@') && !raw.includes(' ') ? raw : null)
    if (email && !isNoReply(email)) return true
  }
  return false
}

// Fix #11 — use last history entry date, not updatedAt (which resets on manual edits)
function daysSince(job) {
  const lastHistoryDate = job.history?.length
    ? job.history[job.history.length - 1].date
    : null
  const ref = lastHistoryDate || job.updatedAt || job.date
  return (new Date() - new Date(ref)) / (1000 * 60 * 60 * 24)
}

// Get the most recent non-calendar history note
function lastNote(job) {
  const hist = [...(job.history || [])].reverse()
  return (hist.find(h => h.source !== 'calendar')?.note || '').toLowerCase()
}

// Check if a remerciement (thank you) email has already been sent
function hasRemerciementSent(job) {
  const hist = (job.history || [])
  return hist.some(h => h.note && h.note.toLowerCase().includes('email de remerciement envoyé'))
}

function hasKeyword(job, ...kws) {
  const notes = (job.history || []).map(h => (h.note || '').toLowerCase()).join(' ')
  return kws.some(k => notes.includes(k))
}

function hasUpcomingCalendar(job) {
  const today = new Date(); today.setHours(0,0,0,0)
  return (job.history || []).some(h => h.source === 'calendar' && h.isUpcoming && new Date(h.date) >= today)
}

// Use case deadline helpers
function useCaseDaysLeft(job) {
  if (!job.useCase?.deadline) return null
  return Math.ceil((new Date(job.useCase.deadline) - new Date()) / (1000 * 60 * 60 * 24))
}

const TEST_KWS = ['test technique', 'technical test', 'case study', 'assessment', 'exercice technique', 'mise en situation', 'lancement test', 'tech test']
const NEGO_KWS = ['négociation', 'salaire', 'rémunération', 'prétentions', 'package', 'compensation', 'offre salariale']

// Urgent actions - things that need attention NOW
function getUrgentRules() {
  const s = loadSettings()
  return [
  // Use case deadline urgent — appears before all other rules when < 3 days left
  {
    match: j => {
      const days = useCaseDaysLeft(j)
      return days !== null && days <= 3 && j.useCase?.status !== 'submitted'
    },
    icon: '📝', urgency: 'high',
    label: job => `Rendre le cas pratique ${job.company}`,
    tip: job => {
      const days = useCaseDaysLeft(job)
      return days < 0 ? `Deadline dépassée de ${Math.abs(days)}j !` : days === 0 ? "Deadline aujourd'hui !" : `Il reste ${days} jour${days > 1 ? 's' : ''} pour rendre le cas pratique.`
    },
  },
  {
    match: j => j.status === 'sent' && daysSince(j) > s.followUpSentDays && hasRealEmail(j),
    icon: '📨', urgency: 'high',
    label: job => `Relancer ${job.company}`,
    tip: job => `Aucune réponse depuis ${Math.round(daysSince(job))} jours. Un email de relance s'impose.`,
  },
  {
    match: j => j.status === 'reviewing' && daysSince(j) > s.followUpReviewingDays && hasRealEmail(j),
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
    // Interview prep — only when NO test technique keyword (test takes priority)
    match: j => j.status === 'interview' && !hasKeyword(j, ...TEST_KWS),
    icon: '🎯', urgency: 'medium',
    label: job => `Préparer entretien ${job.company}`,
    tip: () => `Prépare tes réponses STAR, recherche l'entreprise, prépare 5 questions.`,
  },
  {
    // Test technique — urgent priority when keyword detected
    match: j => j.status === 'interview' && hasKeyword(j, ...TEST_KWS),
    icon: '💻', urgency: 'medium',
    label: job => `Préparer le test technique ${job.company}`,
    tip: () => `Prépare la documentation, un repo propre, soigne le README et tes explications de choix techniques.`,
    cta: 'Voir les conseils',
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
  // Todo — generate CV (only if not already generated)
  {
    match: j => j.status === 'todo' && !j.cvSaved,
    icon: '📄', type: 'cv',
    label: job => `Générer un CV pour ${job.company}`,
    tip: job => `Adapte ton CV à l'offre ${job.position} avant de postuler.`,
    cta: 'Générer le CV',
  },
  // Follow-up overdue (only if there's a real email to respond to)
  {
    match: j => j.status === 'sent' && daysSince(j) > 14 && hasRealEmail(j),
    icon: '✉️', type: 'email',
    label: job => `Relancer ${job.company}`,
    tip: () => `Email court et poli : rappel de ta candidature + réaffirmation de ton intérêt.`,
    cta: 'Rédiger',
  },
  // Remerciement after rejection
  {
    match: j => j.status === 'rejected' && daysSince(j) < 5 && hasRealEmail(j) && !hasRemerciementSent(j),
    icon: '💌', type: 'email',
    label: job => `Envoyer remerciement ${job.company}`,
    tip: () => `Un email de remerciement te différencie et maintient la relation pour l'avenir.`,
    cta: 'Rédiger',
  },
]

const URGENCY_DOT = {
  high:   'bg-red-500',
  medium: 'bg-orange-400',
  low:    'bg-blue-400',
  info:   'bg-gray-300',
}

// Merge urgent + next steps into one sorted list
function buildAllActions(activeJobs, s) {
  const items = []

  // From urgent rules
  for (const job of activeJobs) {
    for (const rule of getUrgentRules()) {
      if (rule.match(job)) items.push({ job, rule, urgency: rule.urgency, sortKey: { high: 0, medium: 1, low: 2 }[rule.urgency] ?? 3, source: 'urgent' })
    }
  }

  // From next steps rules — avoid duplicating interview prep already in urgent
  const urgentJobIds = new Set(items.filter(i => i.rule.icon === '🎯').map(i => i.job.id))
  for (const job of activeJobs) {
    for (const rule of NEXT_STEPS_RULES) {
      if (!rule.match(job)) continue
      // Skip interview prep if already in urgent for same job
      if (rule.type === 'prep' && !rule.label(job).toLowerCase().includes('test') && urgentJobIds.has(job.id)) continue
      const urgency = rule.priority === 0 ? 'medium' : rule.type === 'email' ? 'low' : 'info'
      items.push({ job, rule, urgency, sortKey: (rule.priority ?? 2) + 2, source: 'next' })
    }
  }

  // Sort by priority first
  items.sort((a, b) => a.sortKey - b.sortKey)

  // Keep only ONE action per job — the highest priority one
  const seenJobs = new Set()
  return items.filter(item => {
    if (seenJobs.has(item.job.id)) return false
    seenJobs.add(item.job.id)
    return true
  }).slice(0, 8)
}

export default function NextAction({ jobs, onGenerateCV, onOpenJob, onSTAR, onDraftEmail }) {
  const [dismissed, setDismissed] = useState(loadDismissed)

  const dismiss = (job, rule) => {
    const key = actionKey(job, rule)
    const next = new Set(dismissed)
    next.add(key)
    setDismissed(next)
    saveDismissed(next)
  }
  const activeJobs = jobs.filter(j => !['cancelled', 'archived'].includes(j.status))
  const s = loadSettings()
  const actions = buildAllActions(activeJobs, s).filter(({ job, rule }) => !dismissed.has(actionKey(job, rule)))
  const urgentCount = actions.filter(a => a.urgency === 'high').length

  if (actions.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        <span className="text-base">🗺️</span>
        <h3 className="text-sm font-semibold text-gray-800">Prochaines étapes</h3>
        {urgentCount > 0 && (
          <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full ml-1">
            {urgentCount} urgent{urgentCount > 1 ? 'es' : 'e'}
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-50 flex-1 overflow-y-auto">
        {actions.map(({ job, rule, urgency }, i) => (
          <div key={i} onClick={() => onOpenJob?.(job)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/40 transition-colors group/action cursor-pointer">
            {/* Urgency dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${URGENCY_DOT[urgency]}`} />
            <span className="text-sm flex-shrink-0">{rule.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{rule.label(job)}</p>
              <p className="text-xs text-gray-400 truncate">{rule.tip(job)}</p>
            </div>
            {/* Action buttons — stopPropagation so row click still navigates */}
            {rule.type === 'cv' && onGenerateCV && (
              <button onClick={e => { e.stopPropagation(); onGenerateCV(job) }} className="flex-shrink-0 text-xs font-medium bg-violet-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-violet-600 transition-colors whitespace-nowrap">
                {rule.cta}
              </button>
            )}
            {rule.type === 'prep' && !rule.label(job).toLowerCase().includes('test') && onSTAR && (
              <button onClick={e => { e.stopPropagation(); onSTAR(job) }} className="flex-shrink-0 text-xs font-medium bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap">
                STAR ✦
              </button>
            )}
            {(rule.source === 'urgent' || rule.type === 'email') && rule.label(job).toLowerCase().includes('remerciement') && onDraftEmail && hasRealEmail(job) && (
              <button onClick={e => { e.stopPropagation(); onDraftEmail(job, 'remerciement') }} className="flex-shrink-0 text-xs font-medium bg-pink-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-pink-600 transition-colors whitespace-nowrap">
                Rédiger ✦
              </button>
            )}
            {rule.label(job).toLowerCase().includes('relancer') && onDraftEmail && (
              <button onClick={e => { e.stopPropagation(); onDraftEmail(job, 'relance') }} className="flex-shrink-0 text-xs font-medium bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap">
                Rédiger ✦
              </button>
            )}
            {rule.source === 'urgent' && rule.icon === '🎯' && onSTAR && !rule.label(job).toLowerCase().includes('test') && (
              <button onClick={e => { e.stopPropagation(); onSTAR(job) }} className="flex-shrink-0 text-xs font-medium bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap">
                STAR ✦
              </button>
            )}
            {/* Dismiss */}
            <button
              onClick={e => { e.stopPropagation(); dismiss(job, rule) }}
              className="flex-shrink-0 opacity-0 group-hover/action:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-md"
              title="Masquer cette action"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
