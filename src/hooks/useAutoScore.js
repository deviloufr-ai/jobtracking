import { useEffect, useRef } from 'react'
import { useCVs } from './useCVs'

// Statuses where a CV-match score is no longer useful — skip to save API calls.
const SKIP_STATUSES = new Set(['archived', 'rejected', 'rejected_ats', 'cancelled'])

// Stable, tiny string hash (used to detect JD changes without storing the full text twice).
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return String(h)
}

// Pick the CV to score this job against:
//  1. The tailored CV already generated/saved for this job (so re-scoring tracks new CVs)
//  2. Otherwise the most-recent uploaded base CV
function cvForJob(job, baseCV) {
  if (job.cvSaved?.markdown) {
    return { text: job.cvSaved.markdown, name: job.cvSaved.filename || 'Generated CV', key: 'gen:' + job.cvSaved.savedAt }
  }
  if (baseCV) return { text: baseCV.text, name: baseCV.name, key: 'base:' + baseCV.id }
  return null
}

// Identify the JD source cheaply (without fetching) so we can build a signature.
function jdSourceId(job) {
  if (job.jobDescription && job.jobDescription.trim()) return 'jd:' + hashStr(job.jobDescription)
  if (job.url) return 'url:' + job.url
  if (job.notes && job.notes.trim().length > 40) return 'notes:' + hashStr(job.notes)
  return null
}

// Resolve the actual JD text (may hit the network for url-only jobs).
async function resolveJD(job) {
  if (job.jobDescription && job.jobDescription.trim()) return job.jobDescription
  if (job.url) {
    try {
      const res = await fetch('/api/fetch-jd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url })
      })
      if (res.ok) { const d = await res.json(); if (d.text) return d.text }
    } catch { /* ignore — fall through */ }
  }
  if (job.notes && job.notes.trim().length > 40) return job.notes
  return null
}

/**
 * Automatically computes a CV↔job match score in the background for every job
 * that has both a CV and a job description available. Re-scores when the job's
 * CV changes (e.g. after generating a tailored CV). Writes { score, scoreDetails,
 * scoreSignature } back via updateJob. Throttled to one job at a time.
 */
export function useAutoScore(jobs, updateJob) {
  const { cvs } = useCVs()
  const processingRef = useRef(false)
  const attemptedRef = useRef(new Set()) // job+signature pairs tried this session (don't retry failures in a loop)
  const updateRef = useRef(updateJob)
  updateRef.current = updateJob

  useEffect(() => {
    if (!jobs?.length || !cvs?.length) return
    if (processingRef.current) return

    const baseCV = [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]

    async function run() {
      processingRef.current = true
      try {
        for (const job of jobs) {
          if (SKIP_STATUSES.has(job.status)) continue

          const cv = cvForJob(job, baseCV)
          if (!cv) continue

          const jdId = jdSourceId(job)
          if (!jdId) continue

          const signature = cv.key + '|' + jdId
          if (job.scoreSignature === signature) continue          // already scored with this exact CV+JD
          const attemptKey = job.id + '::' + signature
          if (attemptedRef.current.has(attemptKey)) continue       // tried (and failed) already this session
          attemptedRef.current.add(attemptKey)

          const jd = await resolveJD(job)
          if (!jd) continue

          try {
            const res = await fetch('/api/score-job', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cvText: cv.text, jobDescription: jd, company: job.company, position: job.position })
            })
            if (!res.ok) continue
            const data = await res.json()
            updateRef.current(job.id, {
              score: data.score,
              scoreSignature: signature,
              scoreDetails: {
                summary: data.summary,
                strengths: data.strengths,
                gaps: data.gaps,
                verdict: data.verdict,
                cvName: cv.name,
                scoredAt: data.scoredAt,
              }
            })
            await new Promise(r => setTimeout(r, 700)) // gentle throttle to respect rate limit
          } catch { /* ignore — will retry next session */ }
        }
      } finally {
        processingRef.current = false
      }
    }

    run()
  }, [jobs, cvs])
}
