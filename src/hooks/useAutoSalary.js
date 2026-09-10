import { useEffect, useRef } from 'react'
import { fetchSalaryForJob, isActiveForSalary } from '../services/salaryFetch'
import { hasCompensation } from '../utils/compensation'
import { getProviderKey } from '../services/apiKey'
import { getFlag, FLAGS } from '../services/featureFlags'

// Cap web searches per session so a large Gmail import can't fan out into a
// costly wall of lookups. New jobs trickle in across sessions; each session tops
// up a few. Gentle throttle between calls to respect the Anthropic rate limit.
const MAX_PER_SESSION = 20
const THROTTLE_MS = 1500

/**
 * Background auto-fill of remuneration for newly added candidatures, mirroring
 * useAutoScore. OPT-IN (FLAGS.AUTO_FILL_SALARY) and only with the user's OWN
 * Claude key, because each lookup runs a web search billed to that key. Fills
 * active jobs that have no compensation and haven't been researched before; marks
 * job.salaryFetchedAt after any attempt (found or not) so it's never re-paid.
 */
export function useAutoSalary(jobs, updateJob) {
  const processingRef = useRef(false)
  const attemptedRef = useRef(new Set())   // job ids tried this session (no tight retry loop)
  const spentRef = useRef(0)               // web searches issued this session (cost bound)
  const updateRef = useRef(updateJob)
  useEffect(() => { updateRef.current = updateJob }, [updateJob])

  useEffect(() => {
    if (!getFlag(FLAGS.AUTO_FILL_SALARY)) return       // opt-in only
    if (!getProviderKey('anthropic')) return           // needs the user's own Claude key
    if (!jobs?.length) return
    if (processingRef.current) return
    if (spentRef.current >= MAX_PER_SESSION) return

    async function run() {
      processingRef.current = true
      try {
        for (const job of jobs) {
          if (spentRef.current >= MAX_PER_SESSION) break
          if (!isActiveForSalary(job)) continue
          if (hasCompensation(job.compensation)) continue  // already has pay
          if (job.salaryFetchedAt) continue                // already researched once
          if (attemptedRef.current.has(job.id)) continue   // tried this session
          attemptedRef.current.add(job.id)
          spentRef.current += 1

          try {
            const patch = await fetchSalaryForJob(job)
            // Mark attempted either way so a no-data job is never re-researched.
            updateRef.current(job.id, patch
              ? { compensation: patch, salaryFetchedAt: new Date().toISOString() }
              : { salaryFetchedAt: new Date().toISOString() })
            await new Promise(r => setTimeout(r, THROTTLE_MS))
          } catch {
            // Transient (network / rate limit / no key mid-run): leave
            // salaryFetchedAt unset so a later session retries. attemptedRef stops
            // a tight loop this session.
          }
        }
      } finally {
        processingRef.current = false
      }
    }

    run()
  }, [jobs])
}
