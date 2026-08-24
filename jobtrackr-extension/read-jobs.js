// JobTrackr — read the tracked-jobs list from the app tab's localStorage.
// Injected into an open (or temporary) JobTrackr tab by the background script,
// exactly like sync.js. Returns a compact list the extension caches so it can
// flag "already applied / already in JobTrackr" on job pages.
//
// The app persists the full applications array under `jobtrackr_applications`
// (its startup restore reads that key); `jobtrackr_jobs` is a legacy fallback.
// We keep only the fields we match on (url / company / position / status / date)
// so the cached copy stays small.
(function () {
  try {
    const parse = (k) => {
      try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] }
    }
    let jobs = parse('jobtrackr_applications')
    if (!Array.isArray(jobs) || jobs.length === 0) {
      const alt = parse('jobtrackr_jobs')
      if (Array.isArray(alt) && alt.length) jobs = alt
    }
    if (!Array.isArray(jobs)) jobs = []

    const compact = jobs.map(j => ({
      url: j.url || '',
      company: j.company || '',
      position: j.position || '',
      status: j.status || '',
      date: j.date || j.date_applied || j.appliedAt || ''
    })).filter(j => j.url || (j.company && j.position))

    return { ok: true, jobs: compact }
  } catch (e) {
    return { ok: false, error: e.message, jobs: [] }
  }
})()
