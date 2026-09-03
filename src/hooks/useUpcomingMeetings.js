import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { fetchCalendarEvents, isCalendarConnected } from '../services/calendar'
import { textMatchesCompany } from '../utils/companyMatch'

// A calendar event is "job-related" if its title shares a distinctive token with
// a tracked company (see companyMatch.js) — full-name containment missed links
// like "Wivoo, a Wavestone Company" ↔ "… premier échange Wivoo".
function matchJob(event, activeJobs) {
  for (const job of activeJobs) {
    if (textMatchesCompany(event.title, job.company)) return job
  }
  return null
}

// Shared data source for the upcoming-interviews surfaces: the full home widget
// (UpcomingMeetings) and the compact NavRail card (RailMeetings). Fetches Google
// Calendar events and reduces them to job-related meetings within `daysAhead`.
// Reloads when the connected accounts change (a new account may hold the invite)
// and when the tab regains focus (e.g. the user just accepted an invite in
// another tab); focus reloads are throttled to once per 60s.
export function useUpcomingMeetings(jobs, { monthsAhead = 2, daysAhead = 60 } = {}) {
  const [rawEvents, setRawEvents] = useState([])
  const [loading, setLoading] = useState(false)

  const activeJobs = useMemo(
    () => (jobs || []).filter(j => !['archived', 'rejected', 'rejected_ats', 'cancelled'].includes(j.status)),
    [jobs]
  )

  const lastLoad = useRef(0)
  const load = useCallback(async () => {
    if (!isCalendarConnected()) return
    lastLoad.current = Date.now()
    setLoading(true)
    try {
      setRawEvents(await fetchCalendarEvents('', monthsAhead))
    } catch {
      setRawEvents([])
    }
    setLoading(false)
  }, [monthsAhead])

  useEffect(() => {
    load()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60000) load()
    }
    window.addEventListener('jobtrackr:gmail-accounts-updated', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('jobtrackr:gmail-accounts-updated', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const meetings = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const limit = new Date(today); limit.setDate(today.getDate() + daysAhead)

    const events = []
    for (const e of rawEvents) {
      if (!e.date) continue
      const d = new Date(e.date); d.setHours(0, 0, 0, 0)
      if (d < today || d > limit) continue

      // Keep events matching a tracked company OR that look like an
      // interview/test/offer (type detected from the title in calendar.js).
      const job = matchJob(e, activeJobs)
      const isInterviewType = ['interview', 'test', 'offer'].includes(e.type)
      if (!job && !isInterviewType) continue

      events.push({
        date: e.date,
        rawStart: e.rawStart || null,
        // Matched → company is the job's name, so the event title is the useful
        // "what/who". Unmatched → the title is the heading, surface location.
        note: job ? (e.title || '') : '',
        company: job ? job.company : e.title,
        position: job ? job.position : (e.location ? `📍 ${e.location}` : ''),
        meetingLink: e.meetingLink,
        source: 'calendar',
        isUpcoming: e.isUpcoming,
      })
    }

    // Nearest first, deduplicated by date+company+note.
    const seen = new Set()
    return events
      .sort((a, b) => new Date(a.rawStart || a.date) - new Date(b.rawStart || b.date))
      .filter(e => {
        const k = `${e.date}-${e.company}-${e.note}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
  }, [rawEvents, activeJobs, daysAhead])

  return { meetings, loading, reload: load }
}
