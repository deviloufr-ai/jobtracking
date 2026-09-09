// Rejection evidence — the structured dataset the AI rejection analysis reasons
// over. Pure and client-side: it reads only the candidate's own signals already
// on each job (the CV/letter that was sent, the match score + gaps, the funnel
// stage, the source, and the rejection email text captured in history notes).
//
// The key idea is CONTRAST: we build a rejected set AND an interviewed set with
// the same fields, plus averages and recurring gaps, so the analysis can see what
// separated the applications that advanced from the ones that were rejected.
import {
  DAY, parseDate, applicationDate, maxStageReached, rejectionInfo,
  sentJobs, rejectionBreakdown,
} from './metrics'

const MAX_REJECTED = 40
const MAX_INTERVIEWED = 15
const NOTE_CHARS = 300

function latestDateFor(job, statuses) {
  const dates = (job.history || [])
    .filter(h => statuses.includes(h.status))
    .map(h => parseDate(h.date))
    .filter(Boolean)
  if (!dates.length) return null
  return new Date(Math.max(...dates.map(d => d.getTime())))
}

// The note attached to the rejection event — usually the rejection email text
// (Gmail ingestion writes the email into the history entry's note). Truncated.
function rejectionNote(job) {
  const entries = (job.history || []).filter(h => h.status === 'rejected' || h.status === 'rejected_ats')
  for (let i = entries.length - 1; i >= 0; i--) {
    const note = (entries[i].note || '').trim()
    if (note) return note.length > NOTE_CHARS ? note.slice(0, NOTE_CHARS) + '…' : note
  }
  return ''
}

function stageLabel(job) {
  const s = maxStageReached(job)
  return s >= 3 ? 'after_interview' : s === 2 ? 'after_screen' : 'no_response'
}

function record(job) {
  const start = applicationDate(job)
  const rejDate = latestDateFor(job, ['rejected', 'rejected_ats'])
  const interviewDate = latestDateFor(job, ['interview'])
  const endDate = rejDate || interviewDate
  return {
    company: job.company || '',
    position: job.position || '',
    source: (job.source || job.platform || job.site || '').trim() || 'unknown',
    stage: stageLabel(job),
    type: rejectionInfo(job).ats ? 'ats' : 'human',
    daysToOutcome: (start && endDate) ? Math.max(0, Math.round((endDate.getTime() - start.getTime()) / DAY)) : null,
    cvAts: job.cvSaved?.atsScore ?? null,
    cvImpact: job.cvSaved?.impactScore ?? null,
    hadTailoredCV: !!job.cvSaved?.markdown,
    hadLetter: !!job.letterSaved?.content,
    matchScore: job.scoreDetails?.score ?? job.score ?? null,
    matchVerdict: job.scoreDetails?.verdict ?? null,
    gaps: (job.scoreDetails?.gaps || []).slice(0, 5),
    rejectionNote: rejectionNote(job),
  }
}

function avg(nums) {
  const vals = nums.filter(n => typeof n === 'number' && !isNaN(n))
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function averages(records) {
  return {
    cvImpact: avg(records.map(r => r.cvImpact)),
    cvAts: avg(records.map(r => r.cvAts)),
    matchScore: avg(records.map(r => r.matchScore)),
    n: records.length,
  }
}

// The match-score gaps that recur across rejected applications — the strongest
// deterministic signal of what the CV keeps failing to cover.
function recurringGaps(records) {
  const counts = new Map()
  for (const r of records) {
    for (const g of r.gaps) {
      const key = String(g).trim().toLowerCase()
      if (!key) continue
      const cur = counts.get(key) || { gap: String(g).trim(), count: 0 }
      cur.count++
      counts.set(key, cur)
    }
  }
  return [...counts.values()].filter(g => g.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12)
}

// Build the full evidence packet from all jobs. `hasData` is false when there is
// nothing worth analyzing yet (no employer rejections).
export function buildRejectionEvidence(jobs) {
  const sent = sentJobs(jobs)
  const rejectedJobs = sent.filter(j => rejectionInfo(j).rejected)
  // Interviewed = reached interview (rank ≥ 3), whatever the final status — the
  // "what worked" contrast set. A rejected-after-interview job is in both sets on
  // purpose: it advanced (interview) yet still got a no.
  const interviewedJobs = sent.filter(j => maxStageReached(j) >= 3)
  const offers = sent.filter(j => maxStageReached(j) >= 4).length

  const rejectedRecords = rejectedJobs.map(record)
  const interviewedRecords = interviewedJobs.map(record)

  // Most-recent first so the truncated samples reflect the current search.
  const byRecency = (a, b) => (b.daysToOutcome ?? 1e9) - (a.daysToOutcome ?? 1e9)
  const rejectedSamples = [...rejectedRecords].sort(byRecency).slice(0, MAX_REJECTED)
  const interviewedSamples = [...interviewedRecords].sort(byRecency).slice(0, MAX_INTERVIEWED)

  return {
    hasData: rejectedJobs.length > 0,
    totals: {
      sent: sent.length,
      rejected: rejectedJobs.length,
      interviewed: interviewedJobs.length,
      offers,
    },
    breakdown: rejectionBreakdown(jobs),
    averages: {
      rejected: averages(rejectedRecords),
      interviewed: averages(interviewedRecords),
    },
    recurringGaps: recurringGaps(rejectedRecords),
    rejectedSamples,
    interviewedSamples,
  }
}
