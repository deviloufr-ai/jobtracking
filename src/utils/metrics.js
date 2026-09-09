// Canonical job-search metrics — the SINGLE source of truth.
//
// Before this module, "taux de réponse" was computed three different ways in
// three files (Stats.jsx, Goals.jsx, Analytics.jsx), so the same word showed
// different numbers on different screens. Every consumer now derives its rates
// from here, so a metric is defined exactly once.

export const DAY = 86400000

// Funnel stage ordering. waiting sits alongside reviewing (both = "in review").
// `done` is a COMPLETED interview (past-dated interviews auto-convert to it), so it
// ranks WITH interview (3), NOT above offer — otherwise a finished interview would
// be counted as an offer in the funnel (reachedOffer = maxStageReached >= 4).
// Terminal states (rejected/cancelled/archived) rank 0 on their own, but a job
// that reached a stage still counts for it via its dated history entries.
export const STAGE_RANK = { todo: 0, sent: 1, reviewing: 2, waiting: 2, interview: 3, done: 3, offer: 4 }

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

// Company-name normalization — mirrors the server dedup (api/deduplicate.js) so
// "Doctolib", "Doctolib SAS" and "doctolib.com" collapse to the same company.
// Strips legal suffixes, common TLDs, generic words and punctuation.
export function normalizeCompany(name) {
  return (name || '').toLowerCase()
    .replace(/\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?\s*$/i, '')
    .replace(/\.(io|com|fr|co|net|org|eu|de|uk|be|ch|ca|us|tech|dev)\s*$/i, '')
    .replace(/\b(technologies|digital|solutions|group|labs|studio|hq|services|consulting|innovation|ventures|project|projects)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

// Collapse every row of the same company into ONE synthetic job at the company's
// furthest state, so a funnel counts each company once — multiple roles or
// re-applications at a company = one company. Rows with no usable company name
// stay standalone (each keyed by its own id). The merge folds every row's history
// AND its current status (as a dated entry) into one history array, so the shared
// metric fns (maxStageReached, hasResponse, rejectionInfo, applicationDate) work on
// the result unchanged; the synthetic status is non-todo whenever any row left
// todo, so sentJobs() still counts the company as sent.
export function groupByCompany(jobs) {
  const groups = new Map()
  for (const job of jobs || []) {
    const norm = normalizeCompany(job.company)
    const key = norm || `__ungrouped__:${job.id ?? Math.random()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(job)
  }
  const merged = []
  for (const rows of groups.values()) {
    if (rows.length === 1) { merged.push(rows[0]); continue }
    const history = []
    let source = ''
    for (const r of rows) {
      for (const h of r.history || []) history.push(h)
      history.push({ status: r.status, date: r.date })
      if (!source) source = r.source || r.platform || r.site || ''
    }
    const firstSent = rows.find(r => r.status !== 'todo')
    merged.push({
      id: rows.map(r => r.id).join('+'),
      company: rows[0].company,
      status: firstSent ? firstSent.status : 'todo',
      date: rows[0].date,
      history,
      source,
    })
  }
  return merged
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

// Employer rejections (NOT candidate-cancelled). A job counts as rejected if its
// current status is a rejection OR any history entry is — so an auto-archived old
// rejection (status became "archived" after 90d) still counts via its history.
// `ats` = it was an ATS auto-filter rejection (rejected_ats) rather than a human no.
export function rejectionInfo(job) {
  let rejected = false, ats = false
  const mark = (s) => { if (s === 'rejected_ats') { rejected = true; ats = true } else if (s === 'rejected') { rejected = true } }
  mark(job.status)
  for (const h of job.history || []) mark(h.status)
  return { rejected, ats }
}

// Break rejections down by the FURTHEST stage reached before the no, so the funnel
// leak is legible: died before any reply, after a screen, or after an interview.
// maxStageReached ignores rejection statuses (rank 0), so it reports the real peak.
// Returns counts + a per-source tally (top sources first) for "where to stop applying".
export function rejectionBreakdown(jobs) {
  const byStage = { noResponse: 0, afterScreen: 0, afterInterview: 0 }
  const byType = { ats: 0, human: 0 }
  const sources = new Map()
  let total = 0
  for (const job of sentJobs(jobs)) {
    const { rejected, ats } = rejectionInfo(job)
    if (!rejected) continue
    total++
    const stage = maxStageReached(job)
    if (stage >= 3) byStage.afterInterview++
    else if (stage === 2) byStage.afterScreen++
    else byStage.noResponse++
    if (ats) byType.ats++; else byType.human++
    const src = (job.source || job.platform || job.site || '').trim() || 'unknown'
    sources.set(src, (sources.get(src) || 0) + 1)
  }
  const bySource = [...sources.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
  return { total, byStage, byType, bySource }
}
