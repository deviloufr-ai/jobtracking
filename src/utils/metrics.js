// Canonical job-search metrics — the SINGLE source of truth.
//
// Before this module, "taux de réponse" was computed three different ways in
// three files (Stats.jsx, Goals.jsx, Analytics.jsx), so the same word showed
// different numbers on different screens. Every consumer now derives its rates
// from here, so a metric is defined exactly once.

export const DAY = 86400000

// Funnel stage ordering. waiting sits alongside reviewing (both = "in review").
// Terminal states (rejected/cancelled/archived) rank 0 on their own, but a job
// that reached a stage still counts for it via its dated history entries.
export const STAGE_RANK = { todo: 0, sent: 1, reviewing: 2, waiting: 2, interview: 3, offer: 4, done: 5 }

// Statuses that prove an employer replied (as opposed to a still-silent "sent").
export const RESPONSE_STATUSES = new Set(['reviewing', 'waiting', 'interview', 'offer', 'done', 'rejected', 'rejected_ats'])

export function parseDate(d) {
  if (!d) return null
  const dt = new Date(d)
  return isNaN(dt) ? null : dt
}

// Earliest known date for a job = the application date (history can back-date it).
export function applicationDate(job) {
  const dates = [job.date, ...(job.history || []).map(h => h.date)]
    .map(parseDate)
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

// Monday 00:00 of the ISO week containing `date`.
export function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

// Furthest funnel stage a job ever reached — current status OR any history entry.
// So an interviewed-then-rejected job still counts as having reached "interview".
export function maxStageReached(job) {
  let max = STAGE_RANK[job.status] ?? 0
  for (const h of job.history || []) {
    const r = STAGE_RANK[h.status] ?? 0
    if (r > max) max = r
  }
  return max
}

// Did this job ever get a real reply? True if its current status is a response
// status, if it progressed past "sent" (rank ≥ 2), or if any history entry is a
// response status (credits a reply even after a later rejection).
export function hasResponse(job) {
  if (RESPONSE_STATUSES.has(job.status)) return true
  if (maxStageReached(job) >= 2) return true
  return (job.history || []).some(h => RESPONSE_STATUSES.has(h.status))
}

// "Sent" = every application that actually left the todo stage. This is the
// denominator for every rate below — archived jobs still count (they were sent).
export function sentJobs(jobs) {
  return (jobs || []).filter(j => j.status !== 'todo')
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

// Taux de réponse = candidatures ayant reçu une réponse ÷ candidatures envoyées.
export function responseRate(jobs) {
  const sent = sentJobs(jobs)
  return pct(sent.filter(hasResponse).length, sent.length)
}

// Taux d'entretien = candidatures ayant atteint l'entretien ÷ candidatures envoyées.
export function interviewRate(jobs) {
  const sent = sentJobs(jobs)
  return pct(sent.filter(j => maxStageReached(j) >= 3).length, sent.length)
}
