import { useState } from 'react'
import { getStatus, deriveStatusFromHistory } from '../hooks/useJobs'
import { loadSettings } from '../hooks/useSettings'
import { isNoReply, extractRecipientEmail } from './EmailDraft'
import { pushLocalPrefs } from '../services/profileSync'

// Status shown in the UI follows the latest timeline entry (see JobRow), but the
// raw stored job.status isn't self-healed on initial load. Rules must read the
// effective status so a job whose pill says "Rejetée" actually matches.
const effectiveStatus = job => deriveStatusFromHistory(job?.history) || job?.status

const DISMISSED_KEY = 'jobtrackr_dismissed_actions'
// Persist dismissals across sessions (localStorage) so hiding an action sticks.
export function loadDismissed() { try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() } }
function saveDismissed(s) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s])) } catch {}
  // Mirror to Supabase so hidden actions stay hidden across devices.
  pushLocalPrefs()
}

// Persist a dismissal and return the updated set. Shared by the classic
// "Prochaines étapes" list (NextAction) and the new-design FocusBand cards so
// hiding an action sticks and behaves identically across both surfaces.
export function dismissAction(job, rule) {
  const next = loadDismissed()
  next.add(actionKey(job, rule))
  saveDismissed(next)
  return next
}

// Helper to format translation strings with dynamic values
function formatTrans(key, replacements = {}) {
  let str = key
  for (const [k, v] of Object.entries(replacements)) {
    str = str.replace(`{${k}}`, v)
  }
  return str
}

function actionKey(job, rule) { return `${job.id}__${rule.label(job).slice(0, 40)}` }

// Returns true if the job has at least one real (non-ATS, non-no-reply) inbound email address
function hasRealEmail(job) {
  return (job?.history || []).some(inboundEmail)
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

// Parse a real recruiter address out of an inbound history entry, skipping
// no-reply/ATS senders. Returns null when the entry isn't a usable reply.
function inboundEmail(h) {
  if (h.fromMe || !h.from) return null
  const raw = h.from.trim()
  const angleMatch = raw.match(/<([^>]+@[^>]+)>/)
  const email = angleMatch ? angleMatch[1].trim() : (raw.includes('@') && !raw.includes(' ') ? raw : null)
  return email && !isNoReply(email) ? email : null
}

// True when a follow-up (relance) email has already been sent and the recruiter
// hasn't replied since — re-suggesting another follow-up would just pester them.
// A real inbound reply resets the clock, so a fresh follow-up becomes fair game
// again. Mirrors hasRemerciementSent() for thank-you emails.
function hasFollowUpSent(job) {
  const hist = job.history || []
  // Index of the most recent genuine reply from the recruiter.
  let lastInbound = -1
  for (let i = hist.length - 1; i >= 0; i--) {
    if (inboundEmail(hist[i])) { lastInbound = i; break }
  }
  // Any follow-up the candidate sent after that reply?
  return hist.some((h, i) =>
    i > lastInbound &&
    h.fromMe &&
    /email de relance envoyé|follow-?up (email )?sent/i.test(h.note || '')
  )
}

// Unambiguous phrases indicating the candidate already submitted/finished the test.
// Kept deliberately tight to avoid matching "test envoyé"/"lancement test" (recruiter sending it).
const TEST_DONE_KWS = [
  'test soumis', 'test rendu', 'test terminé', 'test complété', 'test fini', 'test livré',
  'rendu le test', 'soumis le test', 'livré le test',
  'exercice rendu', 'exercice terminé', 'exercice soumis',
  'test submitted', 'test completed', 'test done', 'test finished', 'submitted the test', 'completed the test',
]
// True when the test is done, either via a completion note or a submitted use case.
function isTestDone(job) {
  if (job.useCase?.status === 'submitted') return true
  return hasKeyword(job, ...TEST_DONE_KWS)
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
function caseDaysLeft(job) {
  if (!job.useCase?.deadline) return null
  return Math.ceil((new Date(job.useCase.deadline) - new Date()) / (1000 * 60 * 60 * 24))
}

const TEST_KWS = ['test technique', 'technical test', 'case study', 'assessment', 'exercice technique', 'mise en situation', 'lancement test', 'tech test']
const NEGO_KWS = ['négociation', 'salaire', 'rémunération', 'prétentions', 'package', 'compensation', 'offre salariale']

// Urgent actions - things that need attention NOW
function getUrgentRules(t = (key) => key) {
  const s = loadSettings()
  return [
  // Use case deadline urgent — appears before all other rules when < 3 days left
  {
    match: j => {
      const days = caseDaysLeft(j)
      return days !== null && days <= 3 && j.useCase?.status !== 'submitted'
    },
    icon: '📝', urgency: 'high',
    label: job => formatTrans(t('nextActionRules.caseSubmit'), { company: job.company }),
    tip: job => {
      const days = caseDaysLeft(job)
      return days < 0
        ? formatTrans(t('nextActionRules.caseDeadlinePassed'), { days: Math.abs(days) })
        : days === 0
          ? t('nextActionRules.caseDeadlineToday')
          : formatTrans(t('nextActionRules.caseDeadlineIn'), { days, s: days > 1 ? 's' : '' })
    },
  },
  {
    match: j => j.status === 'sent' && daysSince(j) > s.followUpSentDays && hasRealEmail(j) && !hasFollowUpSent(j),
    icon: '📨', urgency: 'high', emailType: 'relance',
    label: job => formatTrans(t('nextActionRules.followUpSent'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.noResponseSince'), { days: Math.round(daysSince(job)) }),
  },
  {
    match: j => j.status === 'reviewing' && daysSince(j) > s.followUpReviewingDays && hasRealEmail(j) && !hasFollowUpSent(j),
    icon: '📨', urgency: 'medium', emailType: 'relance',
    label: job => formatTrans(t('nextActionRules.followUpReviewing'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.reviewingNoResponse'), { days: Math.round(daysSince(job)) }),
  },
  {
    match: j => j.status === 'waiting' && daysSince(j) > s.followUpWaitingDays && hasRealEmail(j) && !hasFollowUpSent(j),
    icon: '🔔', urgency: 'high', emailType: 'relance',
    label: job => formatTrans(t('nextActionRules.followUpWaiting'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.waitingSince'), { days: Math.round(daysSince(job)) }),
  },
  {
    // Post-interview silence — the interview happened (no upcoming event) and
    // there's been no feedback for a while. Distinct from the "prepare interview"
    // nudges below, which only help BEFORE the interview.
    match: j => j.status === 'interview' && !hasUpcomingCalendar(j) && daysSince(j) > s.followUpReviewingDays && hasRealEmail(j) && !hasFollowUpSent(j),
    icon: '📨', urgency: 'medium', emailType: 'relance',
    label: job => formatTrans(t('nextActionRules.followUpInterview'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.interviewNoFeedback'), { days: Math.round(daysSince(job)) }),
  },
  {
    match: j => j.status === 'offer' && daysSince(j) > s.followUpOfferDays,
    icon: '🤝', urgency: 'high',
    label: job => formatTrans(t('nextActionRules.respondToOffer'), { company: job.company }),
    tip: () => t('nextActionRules.offerReceived'),
  },
  {
    // Interview prep — when NO pending test (test takes priority until it's done)
    match: j => j.status === 'interview' && (!hasKeyword(j, ...TEST_KWS) || isTestDone(j)),
    icon: '🎯', type: 'prep', urgency: 'medium',
    label: job => formatTrans(t('nextActionRules.prepareInterview'), { company: job.company }),
    tip: () => t('nextActionRules.prepareStar'),
  },
  {
    // Test technique — urgent priority when keyword detected and not yet submitted
    match: j => j.status === 'interview' && hasKeyword(j, ...TEST_KWS) && !isTestDone(j),
    icon: '💻', urgency: 'medium',
    label: job => formatTrans(t('nextActionRules.prepareTechTest'), { company: job.company }),
    tip: () => t('nextActionRules.prepareDocumentation'),
    cta: t('nextActionRules.viewAdvice'),
  },
]}

// Next steps — note-aware, contextual. Order = priority shown to user.
function getNextStepsRules(t = (key) => key) {
  const s = loadSettings()
  return [
  // Upcoming calendar event (test/meeting) — highest priority
  {
    match: j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status) && hasUpcomingCalendar(j) && hasKeyword(j, ...TEST_KWS) && !isTestDone(j),
    icon: '💻', type: 'prep',
    label: job => formatTrans(t('nextActionRules.prepareTechTest'), { company: job.company }),
    tip: () => t('nextActionRules.prepareDocumentation'),
    cta: t('nextActionRules.viewAdvice'),
    priority: 0,
  },
  // Tech test mentioned anywhere in history (even without calendar)
  {
    match: j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status) && hasKeyword(j, ...TEST_KWS) && !isTestDone(j) && !hasUpcomingCalendar(j),
    icon: '💻', type: 'prep',
    label: job => formatTrans(t('nextActionRules.prepareTechTest'), { company: job.company }),
    tip: () => t('nextActionRules.prepareDocumentation'),
    cta: t('nextActionRules.viewAdvice'),
    priority: 1,
  },
  // Upcoming calendar event (interview)
  {
    match: j => !['archived','rejected','rejected_ats','cancelled'].includes(j.status) && hasUpcomingCalendar(j) && (!hasKeyword(j, ...TEST_KWS) || isTestDone(j)),
    icon: '🎯', type: 'prep',
    label: job => formatTrans(t('nextActionRules.prepareInterview'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.prepareInterviewTip'), { company: job.company }),
    cta: t('nextActionRules.viewAdvice'),
    priority: 0,
  },
  // Salary negotiation detected
  {
    match: j => !['archived','rejected','rejected_ats','cancelled','todo'].includes(j.status) && hasKeyword(j, ...NEGO_KWS),
    icon: '💰', type: 'negotiate',
    label: job => formatTrans(t('nextActionRules.prepareNegotiation'), { company: job.company }),
    tip: () => t('nextActionRules.negotiationTips'),
    cta: t('nextActionRules.viewAdvice'),
    priority: 1,
  },
  // Interview status without a pending test
  {
    match: j => j.status === 'interview' && (!hasKeyword(j, ...TEST_KWS) || isTestDone(j)),
    icon: '🎯', type: 'prep',
    label: job => formatTrans(t('nextActionRules.prepareInterview'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.prepareInterviewTip'), { company: job.company }),
    cta: t('nextActionRules.viewAdvice'),
    priority: 1,
  },
  // Offer received
  {
    match: j => j.status === 'offer',
    icon: '🤝', type: 'negotiate',
    label: job => formatTrans(t('nextActionRules.respondToOffer'), { company: job.company }),
    tip: () => t('nextActionRules.offerNegotiateTip'),
    cta: t('nextActionRules.viewAdvice'),
  },
  // Todo — generate CV (only if not already generated)
  {
    match: j => j.status === 'todo' && !j.cvSaved,
    icon: '📄', type: 'cv',
    label: job => formatTrans(t('nextActionRules.generateCVFor'), { company: job.company }),
    tip: job => formatTrans(t('nextActionRules.generateCVTip'), { position: job.position, company: job.company }),
    cta: t('nextActionRules.generateCVButton'),
  },
  // Follow-up overdue (only if there's a real email to respond to)
  {
    match: j => j.status === 'sent' && daysSince(j) > s.followUpSentDays && hasRealEmail(j) && !hasFollowUpSent(j),
    icon: '✉️', type: 'email', emailType: 'relance',
    label: job => formatTrans(t('nextActionRules.followUpOverdue'), { company: job.company }),
    tip: () => t('nextActionRules.followUpTip'),
    cta: t('nextActionRules.draftEmail'),
  },
  // Remerciement after rejection (only when a real recipient address exists, so
  // the thank-you can actually be sent — no point suggesting a draft the user
  // can't send because the Send button stays disabled with an empty recipient)
  {
    match: j => ['rejected', 'rejected_ats'].includes(effectiveStatus(j)) && !hasRemerciementSent(j) && !!extractRecipientEmail(j),
    icon: '💌', type: 'email', emailType: 'remerciement',
    label: job => formatTrans(t('nextActionRules.sendThanks'), { company: job.company }),
    tip: () => t('nextActionRules.thanksTip'),
    cta: t('nextActionRules.draftEmail'),
    priority: 2,
  },
]
}

const URGENCY_DOT = {
  high:   'bg-red-500',
  medium: 'bg-orange-400',
  low:    'bg-blue-400',
  info:   'bg-gray-300',
}

// Merge urgent + next steps into one sorted list
export function buildAllActions(activeJobs, s, t = (key) => key, dismissed = new Set()) {
  const items = []

  // From urgent rules
  for (const job of activeJobs) {
    for (const rule of getUrgentRules(t)) {
      if (rule.match(job)) items.push({ job, rule, urgency: rule.urgency, sortKey: { high: 0, medium: 1, low: 2 }[rule.urgency] ?? 3, source: 'urgent' })
    }
  }

  // From next steps rules — avoid duplicating interview prep already in urgent
  const urgentJobIds = new Set(items.filter(i => i.rule.icon === '🎯').map(i => i.job.id))
  const nextStepsRules = getNextStepsRules(t)
  for (const job of activeJobs) {
    for (const rule of nextStepsRules) {
      if (!rule.match(job)) continue
      // Skip interview prep if already in urgent for same job
      if (rule.type === 'prep' && !rule.label(job).toLowerCase().includes('test') && urgentJobIds.has(job.id)) continue
      const urgency = rule.priority === 0 ? 'medium' : rule.type === 'email' ? 'low' : 'info'
      items.push({ job, rule, urgency, sortKey: (rule.priority ?? 2) + 2, source: 'next' })
    }
  }

  // Sort by priority first
  items.sort((a, b) => a.sortKey - b.sortKey)

  // Keep only ONE action per job — the highest priority one. This runs BEFORE the
  // dismissed filter on purpose: dismissing the card the user actually sees must
  // hide that job's action outright, not silently promote a lower-priority action
  // for the same job into its place. A `sent` job, for instance, matches both the
  // urgent "follow up" rule and the next-step "follow-up overdue" rule — different
  // labels, so different dismiss keys. Filtering first would let the second card
  // reappear the instant the first is dismissed ("deleted cards keep showing").
  // If the job's situation later changes, its new top action carries a new label
  // (new key) and resurfaces as expected.
  const seenJobs = new Set()
  const deduped = items.filter(item => {
    if (seenJobs.has(item.job.id)) return false
    seenJobs.add(item.job.id)
    return true
  })

  // Drop dismissed actions BEFORE capping — otherwise a hidden action wastes a
  // slot and can push a real action (e.g. a rejection follow-up) past the limit.
  const visible = deduped.filter(item => !dismissed.has(actionKey(item.job, item.rule)))

  // Cap the list, but NEVER drop a rejection follow-up draft: a gracious reply
  // is time-sensitive and there are only a handful, so guarantee they appear
  // even when higher-priority follow-ups would otherwise fill every slot.
  const isRejectionDraft = item =>
    item.rule.type === 'email' && /remerciement|thank/i.test(item.rule.label(item.job))
  const capped = visible.slice(0, 12)
  const cappedSet = new Set(capped)
  const missedRejections = visible.filter(item => isRejectionDraft(item) && !cappedSet.has(item))
  return [...capped, ...missedRejections]
}

// Clicking a next-step action should DO the action, not just open the job:
// a thank-you card opens the thank-you email, a follow-up opens the follow-up
// draft, a CV card opens the generator, an interview-prep card opens STAR.
// Actions with no dedicated flow (test prep, negotiation, offer…) fall back to
// opening the candidature. Shared by the "Prochaines étapes" list, the FocusBand
// cards and the mobile home so all three behave identically.
export function runPrimaryAction(job, rule, { onGenerateCV, onSTAR, onDraftEmail, onOpenJob } = {}) {
  if (rule.emailType && onDraftEmail) return onDraftEmail(job, rule.emailType)
  if (rule.type === 'cv' && onGenerateCV) return onGenerateCV(job)
  if (rule.type === 'prep' && !rule.label(job).toLowerCase().includes('test') && onSTAR) return onSTAR(job)
  return onOpenJob?.(job)
}

export default function NextAction({ jobs, onGenerateCV, onOpenJob, onSTAR, onDraftEmail, t = (key) => key }) {
  const [dismissed, setDismissed] = useState(loadDismissed)

  const dismiss = (job, rule) => setDismissed(dismissAction(job, rule))
  // archived/cancelled are explicit terminal flags — check the RAW status, not the
  // derived one. Archiving doesn't add a history entry, so effectiveStatus() of an
  // archived job still reads "rejected" and would wrongly resurface it here.
  const activeJobs = jobs.filter(j => !['cancelled', 'archived'].includes(j.status))
  const s = loadSettings()
  const actions = buildAllActions(activeJobs, s, t, dismissed)
  const urgentCount = actions.filter(a => a.urgency === 'high').length

  // Empty state — no pending actions. Return a friendly "all caught up" card
  // (NOT null): this component sits in a 2-col grid next to Stats, so returning
  // null collapses its grid cell and leaves the whole right half blank.
  if (actions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 h-full flex flex-col">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <span className="text-base">🗺️</span>
          <h3 className="text-sm font-semibold text-gray-800">{t('nextAction.title')}</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-sm shadow-green-200/60 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-800">{t('nextAction.emptyTitle')}</p>
          <p className="text-xs text-gray-400 mt-1 max-w-[240px] leading-relaxed">{t('nextAction.emptyDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        <span className="text-base">🗺️</span>
        <h3 className="text-sm font-semibold text-gray-800">{t('nextAction.title')}</h3>
        {urgentCount > 0 && (
          <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full ml-1">
            {urgentCount} urgent{urgentCount > 1 ? 'es' : 'e'}
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-50 flex-1 overflow-y-auto">
        {actions.map(({ job, rule, urgency }, i) => (
          <div key={i} onClick={() => runPrimaryAction(job, rule, { onGenerateCV, onSTAR, onDraftEmail, onOpenJob })} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/40 transition-colors group/action cursor-pointer">
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
            {/* Only reaches here when a real recipient address was found (see the
                remerciement rule's match), so the drafted thank-you can actually
                be sent rather than landing on a disabled Send button. */}
            {rule.emailType === 'remerciement' && onDraftEmail && (
              <button onClick={e => { e.stopPropagation(); onDraftEmail(job, 'remerciement') }} className="flex-shrink-0 text-xs font-medium bg-pink-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-pink-600 transition-colors whitespace-nowrap">
                {t('nextActionRules.draftEmail')} ✦
              </button>
            )}
            {rule.emailType === 'relance' && onDraftEmail && (
              <button onClick={e => { e.stopPropagation(); onDraftEmail(job, 'relance') }} className="flex-shrink-0 text-xs font-medium bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap">
                {t('nextActionRules.draftEmail')} ✦
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
              title={t('nextAction.dismiss')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
