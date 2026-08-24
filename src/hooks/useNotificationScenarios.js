import { useEffect, useCallback } from 'react'
import {
  canSendNotification,
  recordNotificationSent,
  isScenarioStillTriggered,
  loadNotificationSettings,
  isScenarioAutoDisabled,
} from '../services/notificationRules'
import { sendBrowserNotification, isWithinNotificationHours, getTimeZone } from './useNotificationPermission'

const LAST_CHECK_KEY = 'jobtrackr_notif_last_check'
const PREVIOUS_JOBS_KEY = 'jobtrackr_notif_previous_jobs'

function getLastCheckTime() {
  const stored = localStorage.getItem(LAST_CHECK_KEY)
  return stored ? parseInt(stored) : 0
}

function recordCheckTime() {
  localStorage.setItem(LAST_CHECK_KEY, Date.now().toString())
}

function getPreviousJobs() {
  try {
    const stored = localStorage.getItem(PREVIOUS_JOBS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function recordPreviousJobs(jobs) {
  try {
    const snapshot = Object.fromEntries(jobs.map(j => [j.id, { status: j.status }]))
    localStorage.setItem(PREVIOUS_JOBS_KEY, JSON.stringify(snapshot))
  } catch {}
}

// Format a date as a short local time (e.g. "14:30"), empty string if invalid
function formatTime(dateStr) {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Format a date as a short local day + month (e.g. "12 août"), empty if invalid
function formatDay(dateStr) {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  } catch {
    return ''
  }
}

// Join non-empty body fragments with " · " so a missing position/time collapses cleanly
function buildBody(...parts) {
  return parts.filter(Boolean).join(' · ')
}

export function useNotificationScenarios(jobs, permission) {
  const checkScenarios = useCallback(() => {
    if (permission !== 'granted') return

    const settings = loadNotificationSettings()
    const timezone = getTimeZone()

    // Only run checks during notification hours
    if (!isWithinNotificationHours(timezone)) return

    jobs.forEach(job => {
      const {
        id: jobId,
        company,
        position = '',
        status,
        date: jobDate,
        history = [],
        notes = '',
      } = job

      // Skip archived jobs
      if (status === 'archived') return

      const now = Date.now()
      const jobDateMs = new Date(jobDate).getTime()
      const daysSinceApplication = Math.floor((now - jobDateMs) / (1000 * 60 * 60 * 24))

      // ─ N01: No response after 14 days ────────────────────────────────────────
      if (settings.n01_no_response_14d && !isScenarioAutoDisabled('n01_no_response_14d')) {
        if (['sent', 'reviewing', 'waiting'].includes(status) && daysSinceApplication >= 14) {
          const check = canSendNotification('n01_no_response_14d', jobId, job)
          if (check.allowed && isScenarioStillTriggered('n01_no_response_14d', job)) {
            sendBrowserNotification(`Relancer ${company}`, {
              tag: `n01-${jobId}`,
              body: buildBody(
                position,
                `Sans réponse depuis ${daysSinceApplication} jours — un mail de relance peut débloquer la situation`,
              ),
              data: { jobId, company, position, scenario: 'n01_no_response_14d' },
            })
            recordNotificationSent('n01_no_response_14d', jobId, { company, position, daysWaiting: daysSinceApplication })
          }
        }
      }

      // ─ N02: Interview in 24h ────────────────────────────────────────────────
      if (settings.n02_interview_24h && !isScenarioAutoDisabled('n02_interview_24h')) {
        if (status === 'interview') {
          const interviewHistoryEntry = history.find(e => e.status === 'interview')
          if (interviewHistoryEntry) {
            const interviewDateStr = interviewHistoryEntry.date || interviewHistoryEntry.plannedDate
            if (interviewDateStr) {
              const interviewDate = new Date(interviewDateStr).getTime()
              const hoursUntilInterview = (interviewDate - now) / (1000 * 60 * 60)

              // Trigger between 24 and 0 hours before interview
              if (hoursUntilInterview <= 24 && hoursUntilInterview > 0) {
                const check = canSendNotification('n02_interview_24h', jobId, job)
                if (check.allowed && isScenarioStillTriggered('n02_interview_24h', job)) {
                  const interviewTime = formatTime(interviewDateStr)
                  const hoursLabel = Math.max(1, Math.round(hoursUntilInterview))
                  sendBrowserNotification(`Entretien demain — ${company}`, {
                    tag: `n02-${jobId}`,
                    body: buildBody(
                      position,
                      interviewTime ? `à ${interviewTime} (dans ${hoursLabel}h)` : `dans ${hoursLabel}h`,
                      'Relisez la fiche de poste et vos notes',
                    ),
                    data: { jobId, company, position, scenario: 'n02_interview_24h' },
                  })
                  recordNotificationSent('n02_interview_24h', jobId, { company, position, interviewTime })
                }
              }
            }
          }
        }
      }

      // ─ N03: Offer received ──────────────────────────────────────────────────
      if (settings.n03_offer_received && !isScenarioAutoDisabled('n03_offer_received')) {
        if (status === 'offer') {
          const check = canSendNotification('n03_offer_received', jobId, job)
          if (check.allowed && isScenarioStillTriggered('n03_offer_received', job)) {
            sendBrowserNotification(`Offre reçue ! 🎉`, {
              tag: `n03-${jobId}`,
              body: position
                ? `${company} vous propose le poste de ${position} — pensez à répondre`
                : `${company} vous propose une offre — pensez à répondre`,
              data: { jobId, company, position, scenario: 'n03_offer_received' },
            })
            recordNotificationSent('n03_offer_received', jobId, { company, position })
          }
        }
      }

      // ─ N04: Rejection received ──────────────────────────────────────────────
      if (settings.n04_rejection && !isScenarioAutoDisabled('n04_rejection')) {
        if (['rejected', 'rejected_ats'].includes(status)) {
          const check = canSendNotification('n04_rejection', jobId, job)
          if (check.allowed && isScenarioStillTriggered('n04_rejection', job)) {
            const isAts = status === 'rejected_ats'
            sendBrowserNotification(`Refus — ${company}`, {
              tag: `n04-${jobId}`,
              body: buildBody(
                position,
                isAts ? 'Candidature écartée au filtrage ATS' : 'Candidature non retenue',
              ),
              data: { jobId, company, position, scenario: 'n04_rejection' },
            })
            recordNotificationSent('n04_rejection', jobId, { company, position, ats: isAts })
          }
        }
      }

      // ─ N05: Profile under review > 7 days ───────────────────────────────────
      if (settings.n05_reviewing_7d && !isScenarioAutoDisabled('n05_reviewing_7d')) {
        if (status === 'reviewing') {
          const reviewingHistoryEntry = history.find(e => e.status === 'reviewing')
          if (reviewingHistoryEntry) {
            const reviewStartDate = new Date(reviewingHistoryEntry.date).getTime()
            const daysSinceReviewStart = Math.floor((now - reviewStartDate) / (1000 * 60 * 60 * 24))

            if (daysSinceReviewStart >= 7) {
              const check = canSendNotification('n05_reviewing_7d', jobId, job)
              if (check.allowed && isScenarioStillTriggered('n05_reviewing_7d', job)) {
                sendBrowserNotification(`Profil en attente — ${company}`, {
                  tag: `n05-${jobId}`,
                  body: buildBody(
                    position,
                    `En examen depuis ${daysSinceReviewStart} jours — vous pouvez relancer pour marquer votre intérêt`,
                  ),
                  data: { jobId, company, position, scenario: 'n05_reviewing_7d' },
                })
                recordNotificationSent('n05_reviewing_7d', jobId, { company, position, daysReviewing: daysSinceReviewStart })
              }
            }
          }
        }
      }

      // ─ N07: Auto-archived after 60 days (system-triggered) ─────────────────
      if (settings.n07_auto_archived && !isScenarioAutoDisabled('n07_auto_archived')) {
        // Detect when a job just transitioned to archived
        const previousJobs = getPreviousJobs()
        const wasNotArchived = previousJobs[jobId]?.status !== 'archived'
        const isNowArchived = status === 'archived'

        if (wasNotArchived && isNowArchived) {
          const check = canSendNotification('n07_auto_archived', jobId, job)
          if (check.allowed) {
            sendBrowserNotification(`Archivée — ${company}`, {
              tag: `n07-${jobId}`,
              body: buildBody(
                position,
                'Archivée automatiquement après 60 jours sans réponse',
              ),
              data: { jobId, company, position, scenario: 'n07_auto_archived' },
            })
            recordNotificationSent('n07_auto_archived', jobId, { company, position })
          }
        }
      }

      // ─ N08: Deadline reminder 2 days before ────────────────────────────────
      if (settings.n08_deadline_reminder && !isScenarioAutoDisabled('n08_deadline_reminder')) {
        // Extract deadline from notes if present
        const deadlineMatch = notes.match(/deadline[:\s]+([^\n|]+)/i) ||
                             notes.match(/test[:\s]+([^\n|]+)/i) ||
                             notes.match(/deadline:?\s*(\d{4}-\d{2}-\d{2})/i)

        if (deadlineMatch && deadlineMatch[1]) {
          const deadlineStr = deadlineMatch[1].trim()
          try {
            const deadlineDate = new Date(deadlineStr).getTime()
            const daysTilDeadline = (deadlineDate - now) / (1000 * 60 * 60 * 24)

            if (daysTilDeadline <= 2 && daysTilDeadline > 0) {
              const check = canSendNotification('n08_deadline_reminder', jobId, job)
              if (check.allowed && isScenarioStillTriggered('n08_deadline_reminder', job)) {
                const deadlineDay = formatDay(deadlineStr)
                const daysLeft = Math.ceil(daysTilDeadline)
                sendBrowserNotification(`Rappel deadline — ${company}`, {
                  tag: `n08-${jobId}`,
                  body: buildBody(
                    position,
                    deadlineDay
                      ? `Échéance le ${deadlineDay} — dans ${daysLeft} jour(s)`
                      : `Échéance dans ${daysLeft} jour(s)`,
                  ),
                  data: { jobId, company, position, scenario: 'n08_deadline_reminder' },
                })
                recordNotificationSent('n08_deadline_reminder', jobId, { company, position, daysRemaining: daysTilDeadline })
              }
            }
          } catch (e) {
            // Invalid date format, skip
          }
        }
      }
    })

    recordCheckTime()
    recordPreviousJobs(jobs)
  }, [jobs, permission])

  // Check scenarios periodically (every 30 minutes)
  useEffect(() => {
    const lastCheck = getLastCheckTime()
    const thirtyMinutesMs = 30 * 60 * 1000
    const timeSinceLastCheck = Date.now() - lastCheck

    if (timeSinceLastCheck >= thirtyMinutesMs) {
      checkScenarios()
    }

    const interval = setInterval(checkScenarios, thirtyMinutesMs)
    return () => clearInterval(interval)
  }, [checkScenarios])

  return { checkScenarios }
}
