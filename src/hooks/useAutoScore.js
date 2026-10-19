import { useEffect, useRef } from 'react'
import { useCVs } from './useCVs'
import { scoreJobMatch } from '../services/scoreJob'
import { getAiProvider, getProviderKey } from '../services/apiKey'
import { jdSourceId, cvKeyFor, buildScoreSignature, extScoreSignature, hashStr } from '../utils/scoreMatch'

// Statuses where a CV-match score is no longer useful — skip to save API calls.
// `interview` / `done` / `offer` are included: once the candidate is interviewing
// the fit question is settled, the score is just noise (and a paid call).
const SKIP_STATUSES = new Set(['archived', 'rejected', 'rejected_ats', 'cancelled', 'interview', 'done', 'offer'])

// Score the most actionable candidatures first: fresh leads (`todo`), then sent
// ones, then the rest — each group newest-first. With the per-session cap below,
// display order used to spend the budget on old `waiting` rows before new leads.
const STATUS_RANK = { todo: 0, sent: 1, reviewing: 2, waiting: 3 }

// Cap scoring calls per session (mirrors useAutoSalary): a fresh device with a CV
// and hundreds of imported jobs used to fan out into hundreds of calls on load.
// New jobs trickle in; each session tops up a batch.
const MAX_PER_SESSION = 25

// Background scoring runs ONLY on the user's own key. The shared project key is
// a 15-call / 30-day trial: 25 silent scores on load used to eat the whole trial
// before the user had done anything (then every real AI feature returned 402).
// Trial users keep the manual "Score" button (ScoreJob.jsx), which they choose.
function canScore() {
  return !!getProviderKey(getAiProvider())
}

function jobTime(job) {
  const t = Date.parse(job.date || job.created_at || job.createdAt || 0)
  return Number.isFinite(t) ? t : 0
}

function priority(a, b) {
  const ra = STATUS_RANK[a.status] ?? 9
  const rb = STATUS_RANK[b.status] ?? 9
  if (ra !== rb) return ra - rb
  return jobTime(b) - jobTime(a)
}

// Resolve the actual JD text (may hit the network for url-only jobs). Returns
// { text, fetched } — `fetched` is true when the text came from /api/fetch-jd so
// the caller can persist it on the job (it used to be thrown away, and every
// session re-fetched it until a score succeeded).
async function resolveJD(job) {
  if (job.jobDescription && job.jobDescription.trim()) return { text: job.jobDescription, fetched: false }
  if (job.description && job.description.trim()) return { text: job.description, fetched: false }
  if (job.url) {
    try {
      const res = await fetch('/api/fetch-jd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url })
      })
      if (res.ok) { const d = await res.json(); if (d.text) return { text: d.text, fetched: true } }
    } catch { /* ignore — fall through */ }
  }
  if (job.notes && job.notes.trim().length > 40) return { text: job.notes, fetched: false }
  return null
}

/**
 * Automatically computes a CV↔job match score in the background for every job
 * that has both a CV and a job description available, using the user's own AI
 * key. Always scores against the most recent BASE CV: scoring against the
 * tailored CV generated from the same JD measured how well Claude tailored, not
 * the candidate's fit (the number jumped and the gaps list emptied after each
 * generation). The tailored CV has its own number (`cvSaved.atsScore`).
 * Writes { score, scoreDetails, scoreSignature } back via updateJob. Throttled to
 * one job at a time.
 */
export function useAutoScore(jobs, updateJob) {
  const { cvs } = useCVs()
  const processingRef = useRef(false)
  const attemptedRef = useRef(new Set()) // job+signature pairs tried this session (don't retry failures in a loop)
  const spentRef = useRef(0)             // scoring calls issued this session (cost bound)
  const updateRef = useRef(updateJob)
  updateRef.current = updateJob

  useEffect(() => {
    if (!jobs?.length || !cvs?.length) return
    if (processingRef.current) return
    if (spentRef.current >= MAX_PER_SESSION) return
    if (!canScore()) return

    const baseCV = [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    if (!baseCV?.text) return
    const cvKey = cvKeyFor(baseCV)

    async function run() {
      processingRef.current = true
      try {
        const queue = jobs.filter(j => !SKIP_STATUSES.has(j.status)).sort(priority)
        for (const job of queue) {
          if (spentRef.current >= MAX_PER_SESSION) break
          if (!canScore()) break                      // key removed mid-run

          const jdId = jdSourceId(job)
          if (!jdId) continue

          const signature = buildScoreSignature(cvKey, jdId)
          if (job.scoreSignature === signature) continue          // already scored with this exact CV+JD
          // A score the add-on computed (pill / listing scan) on this same JD is
          // kept — re-scoring it here would just spend a call to reach the same
          // number. It is replaced once a fuller JD arrives (jdId changes).
          if (job.scoreSignature && job.scoreSignature === extScoreSignature(job)) continue
          const attemptKey = job.id + '::' + signature
          if (attemptedRef.current.has(attemptKey)) continue       // tried (and failed) already this session
          attemptedRef.current.add(attemptKey)

          const jd = await resolveJD(job)
          if (!jd) continue
          spentRef.current += 1

          try {
            const data = await scoreJobMatch({ cvText: baseCV.text, jobDescription: jd.text, company: job.company, position: job.position })
            const patch = {
              score: data.score,
              scoreDetails: {
                summary: data.summary,
                strengths: data.strengths,
                gaps: data.gaps,
                verdict: data.verdict,
                cvName: baseCV.name,
                scoredAt: data.scoredAt,
              }
            }
            if (jd.fetched) {
              // Persist the fetched JD so CV/letter generation doesn't refetch it,
              // and sign the score with the text we actually scored.
              patch.jobDescription = jd.text
              patch.scoreSignature = buildScoreSignature(cvKey, 'jd:' + hashStr(jd.text))
            } else {
              patch.scoreSignature = signature
            }
            updateRef.current(job.id, patch)
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
