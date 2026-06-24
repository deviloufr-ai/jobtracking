// Application "freshness" / health signal.
//
// For applications still awaiting a response, surfaces how long it's been since
// the last activity (latest history entry, falling back to the application
// date) relative to the user's follow-up and auto-archive thresholds. Lets a
// stalling application be spotted at a glance, before auto-archive hits.

import { loadSettings } from '../hooks/useSettings'

// Statuses where "no recent activity" is actionable (you're waiting on someone).
const AWAITING_STATUSES = new Set(['sent', 'reviewing', 'waiting', 'interview'])

const DAY = 1000 * 60 * 60 * 24

export function daysSinceLastActivity(job) {
  const dates = [(job?.date || null), ...((job?.history || []).map(h => h.date))].filter(Boolean)
  if (dates.length === 0) return null
  const latest = dates.reduce((max, d) => {
    const t = new Date(d).getTime()
    return isNaN(t) ? max : Math.max(max, t)
  }, 0)
  if (!latest) return null
  return Math.max(0, Math.floor((Date.now() - latest) / DAY))
}

function followUpThreshold(status, s) {
  switch (status) {
    case 'sent': return s.followUpSentDays
    case 'reviewing': return s.followUpReviewingDays
    case 'waiting': return s.followUpWaitingDays
    case 'interview': return s.followUpReviewingDays
    default: return s.followUpSentDays
  }
}

/**
 * Returns the health of a job: { level, days, message } where level is one of
 * 'fresh' | 'aging' | 'stale' | 'none'. 'none' means no indicator should show
 * (terminal statuses, todo, or missing dates).
 */
export function getJobHealth(job, settings = loadSettings()) {
  if (!job || !AWAITING_STATUSES.has(job.status)) return { level: 'none', days: null, message: '' }

  const days = daysSinceLastActivity(job)
  if (days === null) return { level: 'none', days: null, message: '' }

  const followUp = followUpThreshold(job.status, settings)
  const archive = settings.archiveSentDays

  if (days < followUp) {
    return { level: 'fresh', days, message: `Actif — dernière activité il y a ${days} j` }
  }
  if (days < archive) {
    return { level: 'aging', days, message: `À relancer — ${days} j sans activité` }
  }
  return { level: 'stale', days, message: `En sommeil — ${days} j sans activité` }
}

export const HEALTH_DOT_CLASS = {
  fresh: 'bg-green-400',
  aging: 'bg-amber-400',
  stale: 'bg-red-400',
  none: '',
}
