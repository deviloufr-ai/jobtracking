import { useEffect, useRef } from 'react'

// Only "applied & waiting" statuses care about whether the posting is still open.
// (todo = not applied yet; interview/offer = past the listing; rejected/etc = done.)
const ACTIVE_STATUSES = new Set(['sent', 'reviewing', 'waiting'])

const DAY_MS = 24 * 60 * 60 * 1000

// Most recent position-check time for a job, falling back to the application date
// when it has never been checked. Returns null if we have no reference at all.
function lastCheckTime(job) {
  let latest = 0
  for (const c of Object.values(job.positionChecks || {})) {
    const t = c?.checkedAt ? new Date(c.checkedAt).getTime() : 0
    if (t > latest) latest = t
  }
  if (latest) return latest
  const base = job.sentAt || job.date
  return base ? new Date(base).getTime() : null
}

/**
 * Automatically runs the position-availability check (the same one behind the
 * Search button) in the background for jobs that are "due". A job is due when:
 *   - it's in an active/waiting status (sent / reviewing / waiting),
 *   - it has at least one positionLink, and
 *   - the time since its last check (or its application date if never checked)
 *     exceeds settings.checkPositionAfterDays.
 *
 * checkPosition already advances positionChecks[url].checkedAt, so once a job is
 * checked it won't be re-checked again until another `checkPositionAfterDays`
 * have passed. Throttled to one job at a time. Disabled when the setting is 0.
 */
export function useAutoCheckPositions(jobs, checkAllPositions, settings) {
  const processingRef = useRef(false)
  const attemptedRef = useRef(new Set()) // jobs tried this session (don't loop)
  const checkRef = useRef(checkAllPositions)
  checkRef.current = checkAllPositions

  const days = settings?.checkPositionAfterDays
  const enabled = settings?.checkPositionEnabled !== false && days > 0

  useEffect(() => {
    if (!enabled || !jobs?.length) return
    if (processingRef.current) return

    async function run() {
      processingRef.current = true
      try {
        for (const job of jobs) {
          if (!ACTIVE_STATUSES.has(job.status)) continue
          if (!job.positionLinks?.length) continue
          if (attemptedRef.current.has(job.id)) continue

          const ref = lastCheckTime(job)
          if (ref == null) continue
          if ((Date.now() - ref) / DAY_MS < days) continue // not due yet

          attemptedRef.current.add(job.id)
          try {
            // auto:true → record the availability signal but never auto-reject on a
            // heuristic page-text match (see checkPosition in useJobs.js).
            await checkRef.current(job.id, 1, { auto: true })
            await new Promise(r => setTimeout(r, 700)) // gentle throttle
          } catch { /* ignore — will retry next session */ }
        }
      } finally {
        processingRef.current = false
      }
    }

    run()
  }, [jobs, enabled, days])
}
