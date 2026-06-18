import { useState, useEffect, useRef, useCallback } from 'react'
import { isConnected, fetchJobEmails, fetchJobEmailsForAccount, getConnectedAccounts, getCachedUser } from '../services/gmail'
import { parseEmailsForJobs, validateAndCleanJobs } from '../services/claude'
import { fetchCalendarEvents } from '../services/calendar'
import { extractJobUrlsFromEmail, rankUrlsByJobRelevance } from '../services/positionChecker'
import { isAtsRejection, isDeletedJob, mergeHistoryBySameDayTopic, ATS_DOMAINS } from './useJobs'
import { normalize, isJobBoard, JOB_BOARD_NAMES } from '../constants/jobBoards'
import { isGenericPosition as isGenericPos } from '../constants/positions'

// Read the flag dynamically on every call so `localStorage.debug = '1'` takes
// effect immediately, without needing a page reload (the flag used to be
// captured once at module load).
const isDebug = () => typeof window !== 'undefined' && localStorage?.getItem('debug') === '1'
const log = (...args) => { if (isDebug()) console.log(...args) }

// Auto-mark previous history items as done when their corresponding meeting has finished
function autoCompletePastMeetings(history) {
  if (!history || history.length === 0) return history

  const now = new Date()
  const updated = [...history]

  // For each calendar event that's in the past, check if it's 2+ hours old
  for (let i = 0; i < updated.length; i++) {
    const entry = updated[i]
    if (entry.source !== 'calendar' || !entry.date) continue

    const eventTime = new Date(entry.date)
    const twoHoursAfter = new Date(eventTime.getTime() + 2 * 60 * 60 * 1000)

    // If meeting happened 2+ hours ago and entry isn't already done
    if (now > twoHoursAfter && entry.status !== 'done') {
      // Find the previous non-calendar entry to mark as done
      for (let j = i - 1; j >= 0; j--) {
        const prevEntry = updated[j]
        if (prevEntry.source === 'email' && prevEntry.status !== 'done' && prevEntry.status !== 'rejected' && prevEntry.status !== 'rejected_ats' && prevEntry.status !== 'cancelled') {
          // Mark previous entry as done since the meeting happened.
          // Do NOT mutate the note text (previously appended " ✓"): the mutated
          // note no longer matched the freshly-parsed email on the next refresh,
          // so the same entry was re-imported as a duplicate. Use a flag instead.
          prevEntry.status = 'done'
          prevEntry.autoCompleted = true
          break
        }
      }
    }
  }

  return updated
}

const REFRESH_KEY = 'jobtrackr_last_refresh'
const REFRESH_INTERVAL_HOURS = 1

const STATUS_ORDER = ['todo','sent','reviewing','interview','done','waiting','offer','rejected','rejected_ats','cancelled','archived']

// ─── Semantic deduplication for history entries ───────────────────────────────
// Group similar entries on same date by keyword overlap (e.g., multiple "test technique" notes)
function deduplicateHistoryBySemantics(history) {
  if (!history || history.length <= 1) return history

  // Extract keywords from a note (words > 3 chars)
  const getKeywords = note => {
    const text = (note || '').toLowerCase()
    const stopwords = new Set(['test', 'technique', 'proposé', 'proposed', 'email', 'entretien', 'interview', 'demande', 'request'])
    return text.split(/\s+/).filter(w => w.length >= 4 && !stopwords.has(w))
  }

  // Group by date
  const byDate = new Map()
  for (const entry of history) {
    const date = entry.date || 'unknown'
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(entry)
  }

  const result = []
  for (const [, entries] of byDate) {
    if (entries.length <= 1) {
      result.push(...entries)
      continue
    }

    // For entries on same date, group by semantic similarity
    const groups = []
    for (const entry of entries) {
      const kw = getKeywords(entry.note)
      let foundGroup = false

      // Check if this entry is similar to any existing group
      for (const group of groups) {
        const groupKw = getKeywords(group[0].note)
        // At least 2 shared keywords = likely same topic
        const shared = [...kw].filter(k => groupKw.includes(k)).length
        if (shared >= 2 || (kw.length > 0 && shared / Math.max(kw.length, groupKw.length) > 0.4)) {
          group.push(entry)
          foundGroup = true
          break
        }
      }

      if (!foundGroup) groups.push([entry])
    }

    // For each group, keep the longest/most informative entry but preserve all gmailIds
    for (const group of groups) {
      const best = group.reduce((a, b) =>
        ((a.note || '').length > (b.note || '').length ? a : b)
      )
      // Collect all unique gmailIds from the entire group
      const allIds = new Set()
      for (const entry of group) {
        if (entry.gmailId) allIds.add(entry.gmailId)
      }
      // Store multiple IDs if they exist
      if (allIds.size > 1) {
        best.gmailIds = [...allIds]
      } else if (allIds.size === 1) {
        best.gmailId = [...allIds][0]
      }
      result.push(best)
    }
  }

  return result.sort((a, b) => new Date(a.date) - new Date(b.date))
}

function extractMeetingLink(text = '') {
  const patterns = [
    /(https:\/\/meet\.google\.com\/[a-z0-9\-]+)/i,
    /(https:\/\/[a-z0-9]+\.zoom\.us\/j\/[^\s"<>]+)/i,
    /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+)/i,
    /(https:\/\/whereby\.com\/[^\s"<>]+)/i,
    /(https:\/\/[a-z0-9]+\.webex\.com\/[^\s"<>]+)/i,
  ]
  for (const p of patterns) { const m = text.match(p); if (m) return m[1] }
  return null
}

// Shared logic: parse emails + calendar → grouped jobs with full history
// ─── Intelligent pre-parse filter ────────────────────────────────────────────
// Statuses we treat as "closed": a refused candidature never needs new emails.
// Deliberately narrow (per product decision): only outright rejections. Active
// states (reviewing/interview/waiting/offer) keep pulling updates.
const CLOSED_STATUSES = new Set(['rejected', 'rejected_ats'])

// A sender is "shared" when it belongs to a job board / ATS rather than one
// specific employer (e.g. notifications@linkedin.com, no-reply@greenhouse.io).
// Skipping by shared sender is unsafe — one address serves many companies — so
// these are excluded from sender-based rules entirely.
// Pull the bare address out of a "Name <addr@dom>" / "addr@dom" From header.
function bareAddr(from) {
  const s = (from || '').toLowerCase().trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim()
}

function isSharedSenderDomain(addr) {
  const domain = (addr || '').split('@')[1] || ''
  if (!domain) return true
  if (ATS_DOMAINS.some(d => domain.includes(d))) return true
  // Match job-board name fragments against the domain's labels
  // ("notifications.linkedin.com" → labels ["notifications","linkedin","com"]).
  const labels = domain.split('.')
  return labels.some(l => JOB_BOARD_NAMES.has(l))
}

// Decide which fetched emails are worth sending to Claude. Three layers, each
// only ever drops an email we can prove is redundant:
//   0. already-imported  — its gmailId is already in some job's history
//   1. closed-candidature — sender maps to ONE refused job
//   2. older-than-last    — sender maps to ONE job and the email predates that
//                           job's latest inbound (email-sourced) event
// Layers 1 & 2 require an UNAMBIGUOUS, non-shared sender; everything else (new
// candidatures, unknown senders, shared platforms) passes through untouched.
export function filterEmailsBeforeParse(emails, jobs) {
  const reasons = { alreadyImported: 0, closed: 0, older: 0 }
  if (!Array.isArray(jobs) || jobs.length === 0) return { kept: emails, reasons }

  // Layer 0 index: every gmailId we've already imported.
  const importedGmailIds = new Set()
  // Layers 1 & 2 index: sender → { jobs:Set, status, lastEmailMs }.
  // Ambiguous senders (mapped to >1 job) are flagged and never used to skip.
  const senderMap = new Map()

  for (const job of jobs) {
    const sendersForJob = new Set()
    let lastEmailMs = 0
    for (const h of job.history || []) {
      if (h.gmailId) importedGmailIds.add(h.gmailId)
      // Anchor the date rule on real inbound emails only — an upcoming calendar
      // interview can be future-dated and would wrongly suppress every email.
      const isEmailEntry = !h.source || h.source === 'email'
      if (isEmailEntry && !h.fromMe && h.date) {
        const ms = new Date(h.date).getTime()
        if (!isNaN(ms) && ms > lastEmailMs) lastEmailMs = ms
      }
      const from = bareAddr(h.from)
      if (isEmailEntry && from && !h.fromMe && !isSharedSenderDomain(from)) {
        sendersForJob.add(from)
      }
    }
    for (const s of sendersForJob) {
      const existing = senderMap.get(s)
      if (existing) {
        existing.ambiguous = true
      } else {
        senderMap.set(s, { ambiguous: false, status: job.status, lastEmailMs })
      }
    }
  }

  const kept = []
  for (const e of emails) {
    // Layer 0 — already imported.
    if (e.id && importedGmailIds.has(e.id)) { reasons.alreadyImported++; continue }

    const entry = senderMap.get(bareAddr(e.from))

    if (entry && !entry.ambiguous) {
      // Layer 1 — sender's only job is refused.
      if (CLOSED_STATUSES.has(entry.status)) { reasons.closed++; continue }
      // Layer 2 — email is older than that job's last inbound event.
      const ms = e.date ? new Date(e.date).getTime() : NaN
      if (!isNaN(ms) && entry.lastEmailMs && ms < entry.lastEmailMs) { reasons.older++; continue }
    }

    kept.push(e)
  }

  return { kept, reasons }
}

export async function buildJobsFromEmails(emails, calendarEvents = []) {
  const parsed = await parseEmailsForJobs(emails)
  if (!parsed.length) {
    log(`📧 Claude parsed ${emails.length} emails but found no job candidatures`)
    return []
  }
  log(`📊 Claude parsed ${emails.length} emails → ${parsed.length} job signals (confidence >= 35)`)

  // Validate and clean: remove duplicates, flag errors, merge same-day entries
  const { jobs: validated, changelog } = await validateAndCleanJobs(parsed)
  if (changelog.merged?.length > 0) {
    log(`🔄 Merged ${changelog.merged.length} duplicate entries`)
  }
  if (changelog.removed?.length > 0) {
    log(`🗑️  Removed ${changelog.removed.length} false positives`)
  }
  if (changelog.flagged?.length > 0) {
    log(`⚠️  Flagged ${changelog.flagged.length} entries with low confidence`)
  }

  const enriched = validated
    .filter(p => {
      const isBoard = isJobBoard(p.company)
      // Keep ATS-fallback candidatures: the ATS/board name IS the company on purpose
      // (e.g. Jobgether) because the real employer was never exposed. Only drop a job-board
      // company when it leaked in by mistake (companyFromAts not set).
      if (isBoard && !p.companyFromAts) {
        log(`🗑️  Filtered job board: ${p.company}/${p.position}`)
        return false
      }
      if (isBoard && p.companyFromAts) {
        log(`🅰️  Kept ATS-fallback candidature: ${p.company}/${p.position}`)
      }
      return !!p.company
    })
    .map(p => ({
      ...p,
      status: p.status === 'rejected' && isAtsRejection(p.notes || '') ? 'rejected_ats' : p.status
    }))

  log(`📋 After filtering job boards: ${enriched.length} signals remain`)

  const emailByGmailId = Object.fromEntries(emails.map(e => [e.id, e]))

  const SUGGESTION_KEYWORDS = ['suggérée', 'suggested job', 'job suggestion', 'alerte indeed', 'alerte emploi', 'job alert', 'recommended job', 'recommandée', 'offre recommandée', 'pas de candidature confirmée', 'offre correspondante']
  const isSuggestion = p => SUGGESTION_KEYWORDS.some(k => (p.notes || '').toLowerCase().includes(k))

  // Normalize company for grouping — match "Manutan" with "Manutan Business Technology"
  // Apply regex repeatedly until no more suffixes remain
  const normalizeCompanyForGrouping = (company) => {
    if (!company) return ''
    let normalized = company.toLowerCase().trim()
    const suffixRegex = /\s+(inc|ltd|gmbh|sa|sarl|eirl|sas|sasu|sprl|group|division|business|solutions|technology|technologies|service|consulting|ventures|locations)\s*\.?\s*$/i

    // Apply regex repeatedly until no more matches (handles "Manutan Business Technology" → "Manutan")
    let prev
    do {
      prev = normalized
      normalized = normalized.replace(suffixRegex, '').trim()
    } while (normalized !== prev && normalized.length > 0)

    return normalized
  }

  // Smart position normalization: remove common suffixes but keep the core role
  // "Product Manager Growth" → "Product Manager"
  // "Senior Product Manager" → "Senior Product Manager" (keep senior since it's important)
  // "PM" → "PM" (keep abbreviations)
  const normalizePositionForGrouping = (pos) => {
    if (!pos) return ''
    let normalized = pos.toLowerCase().trim()
    // Only remove specific suffixes that don't change the core role
    // Avoid removing prefixes like "Senior", "Lead", "Junior" as they distinguish different roles
    const suffixRegex = /\s*(growth|for\s+.*?|h\/f|cdi|cdd|contract|temporary|temp|permanent)$/i
    normalized = normalized.replace(suffixRegex, '').trim()
    return normalized
  }

  const jobGroups = new Map()
  for (const p of enriched) {
    if (!p.company) continue
    if (isSuggestion(p)) continue
    // Group by normalized company + normalized position
    // "Manutan Business Technology" merges with "Manutan"
    // "Product Manager Growth" merges with "Product Manager"
    // But "Senior PM" ≠ "PM" (they're different roles)
    const normCompany = normalizeCompanyForGrouping(p.company)
    const companyKey = normalize(normCompany)
    const normPos = normalizePositionForGrouping(p.position)
    const posKey = normPos || 'unknown'
    const key = isGenericPos(p.position) ? companyKey : `${companyKey}|||${posKey}`
    if (!jobGroups.has(key)) jobGroups.set(key, [])
    jobGroups.get(key).push(p)
  }

  log(`🏢 Grouping into companies: ${jobGroups.size} unique company/position combinations`)
  const grouped = []
  for (const [key, emailsForJob] of jobGroups) {
    log(`  └─ ${key}: ${emailsForJob.length} emails`)
    const sorted = [...emailsForJob].sort((a, b) => new Date(a.date) - new Date(b.date))

    // FIX: Post-process HelloWork rejection emails that Claude mis-parses
    // If notes say "Réponse reçue de l'entreprise via HelloWork" + no positive keywords → force rejection
    const hasHelloWorkResponse = sorted.some(e =>
      (e.notes || '').includes('Réponse reçue de l\'entreprise via HelloWork') ||
      (e.notes || '').includes('Response received from company') ||
      (e.notes || '').includes('response from OpenSourcing via HelloWork')
    )
    const hasPositiveKeywords = sorted.some(e => {
      const text = (e.notes || '').toLowerCase()
      return /entretien|interview|call|visio|meeting|next steps|process suivant|interested|intéressé|pleased|heureux/.test(text)
    })

    if (hasHelloWorkResponse && !hasPositiveKeywords && sorted[sorted.length - 1].status === 'reviewing') {
      // Override to rejection
      sorted[sorted.length - 1].status = 'rejected'
    }
    // Group is updateOnly if ALL its emails are updateOnly (e.g. only "viewed" notifications)
    const allUpdateOnly = sorted.every(e => e._updateOnly)
    const highestStatus = sorted.reduce((best, e) =>
      STATUS_ORDER.indexOf(e.status) > STATUS_ORDER.indexOf(best) ? e.status : best
    , sorted[0].status)

    const history = sorted.map(e => {
      const orig = emailByGmailId[e.gmailId]
      const text = (orig?.body || '') + ' ' + (orig?.snippet || '')
      const meetingLink = extractMeetingLink(text)
      return {
        date: e.date, status: e.status, note: e.notes || '',
        gmailId: e.gmailId, from: e.fromEmail, fromMe: e.fromMe || false,
        source: 'email',
        body: orig?.body || null,
        subject: orig?.subject || null,
        receivedBy: orig?._account || getCachedUser()?.email || null,
        ...(meetingLink && { meetingLink }),
      }
    })

    // Merge calendar events for this company
    const co = (sorted[0].company || '').toLowerCase()
    const calEntries = calendarEvents
      .filter(e => e.title.toLowerCase().includes(co) || (e.description || '').toLowerCase().includes(co))
      .map(e => {
        const meetingLink = extractMeetingLink((e.description || '') + ' ' + (e.location || ''))
        // Use rawStart (full datetime with time) instead of date (date-only) for proper time tracking
        const eventDateTime = e.rawStart || e.date
        return {
          date: eventDateTime,
          status: e.type === 'interview' ? 'interview' : e.type === 'offer' ? 'offer' : 'waiting',
          note: `📅 ${e.title}${e.isUpcoming ? ' (à venir)' : ''}`,
          source: 'calendar', isUpcoming: e.isUpcoming,
          ...(meetingLink && { meetingLink }),
        }
      })

    // Keep entries separate - consolidation causes data corruption (notes get joined with pipes)
    const existingKeys = new Set(history.map(h => `${h.date}-${h.status}`))
    const newCalEntries = calEntries.filter(e => !existingKeys.has(`${e.date}-${e.status}`))
    const merged = [...history, ...newCalEntries].sort((a, b) => new Date(a.date) - new Date(b.date))
    const deduplicated = deduplicateHistoryBySemantics(merged)
    const mergedHistory = mergeHistoryBySameDayTopic(autoCompletePastMeetings(deduplicated))

    const latest = sorted[sorted.length - 1]
    // Pick best position: prefer non-generic over "Unknown"
    const bestPosition = sorted.map(e => e.position || '').find(p => !isGenericPos(p)) || latest.position

    // Collect all email bodies for URL extraction
    const emailBodies = sorted
      .map(e => {
        const orig = emailByGmailId[e.gmailId]
        return orig?.body || ''
      })
      .filter(Boolean)
      .join('\n\n---\n\n')

    // Extract job URLs from email bodies
    const jobUrls = emailBodies ? extractJobUrlsFromEmail(emailBodies) : []
    const positionLinks = jobUrls.length > 0 ? jobUrls : undefined

    grouped.push({
      ...latest,
      position: bestPosition,
      date: sorted[0].date,
      status: highestStatus,
      history: mergedHistory,
      notes: sorted.map(e => e.notes).filter(Boolean).join(' | '),
      _emailBody: emailBodies || undefined,
      ...(positionLinks && { positionLinks }),
      ...(allUpdateOnly && { _updateOnly: true }),
    })
  }
  return grouped
}

export function useAutoRefresh(jobs, addJob, updateJob, showToast, reprocessJobs, settings) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() => {
    const stored = localStorage.getItem(REFRESH_KEY)
    return stored ? new Date(stored) : null
  })
  const hasRunRef = useRef(false)
  const jobsRef = useRef(jobs)
  const refreshingRef = useRef(refreshing)
  const reprocessJobsRef = useRef(reprocessJobs)
  const settingsRef = useRef(settings)
  // doRefresh is memoized with [] deps, so it captures addJob/updateJob from the
  // FIRST render. The first-render updateJob closes over an empty jobs array
  // (before IndexedDB loads), so `jobs.find(...)` finds nothing and the update
  // silently no-ops — existing jobs never got their status/history upgraded on
  // refresh (Bug: Dashlane stayed "À faire" despite "todo → reviewing"). Call
  // the LATEST callbacks via refs instead.
  const addJobRef = useRef(addJob)
  const updateJobRef = useRef(updateJob)

  // Keep refs in sync
  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])
  useEffect(() => {
    reprocessJobsRef.current = reprocessJobs
  }, [reprocessJobs])
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    addJobRef.current = addJob
  }, [addJob])
  useEffect(() => {
    updateJobRef.current = updateJob
  }, [updateJob])

  const doRefresh = useCallback(async (silent = false) => {
    if (!isConnected() || refreshingRef.current) return
    setRefreshing(true)

    // Read the CURRENT jobs list via ref. This callback is memoized with []
    // deps, so the `jobs` param is captured from the first render (empty array
    // before IndexedDB load) — using it for dedup re-imports everything as new.
    const jobs = jobsRef.current
    // Same reason: use the latest addJob/updateJob, not the first-render ones.
    const addJob = addJobRef.current
    const updateJob = updateJobRef.current

    try {
      // Simple time-based sync: scan emails from user-configured lookback period
      // (Not lastSyncTime-based to avoid Gmail indexing delays)
      // Duplicate detection + history merge prevents re-importing same emails
      const gmailLookbackDays = settingsRef.current?.gmailPeriodDays || 14
      const months = gmailLookbackDays / 30

      // Fetch from all connected accounts and merge, tagging each email with its account
      const connectedAccts = getConnectedAccounts()
      let allEmails = []
      if (connectedAccts.length > 1) {
        const perAccount = await Promise.all(
          connectedAccts.map(acct =>
            fetchJobEmailsForAccount(acct.email, 100, months, null, null)
              .then(emails => emails.map(e => ({ ...e, _account: acct.email })))
              .catch(() => [])
          )
        )
        // Deduplicate by id across accounts
        const seen = new Set()
        for (const emails of perAccount) {
          for (const e of emails) {
            if (!seen.has(e.id)) { seen.add(e.id); allEmails.push(e) }
          }
        }
      } else {
        allEmails = await fetchJobEmails(100, months, null, null)
      }
      const [emails, calendarEvents] = await Promise.all([
        Promise.resolve(allEmails),
        fetchCalendarEvents('', months).catch(() => []),
      ])
      if (!emails.length) return

      // Intelligent pre-parse filter: drop emails that would only produce
      // redundant updates — already-imported, tied to a refused candidature, or
      // older than that candidature's last event. Skipped emails never reach
      // Claude, cutting token spend and no-op writes. Manual import bypasses this.
      const { kept: filteredEmails, reasons } = filterEmailsBeforeParse(emails, jobs)
      const totalSkipped = reasons.alreadyImported + reasons.closed + reasons.older
      if (totalSkipped > 0) {
        log(`🧠 Pre-parse filter: skipped ${totalSkipped}/${emails.length} emails (` +
          `${reasons.alreadyImported} already-imported, ${reasons.closed} closed-candidature, ` +
          `${reasons.older} older-than-last-event) → ${filteredEmails.length} sent to Claude`)
      }
      if (!filteredEmails.length) {
        log('📭 All fetched emails filtered out before parsing (nothing new)')
        return
      }

      const grouped = await buildJobsFromEmails(filteredEmails, calendarEvents)
      if (!grouped.length) {
        log('📭 No jobs extracted from emails (all filtered or no matches)')
        return
      }

      log(`✅ Extracted ${grouped.length} jobs from emails`)

      const jobByKey = new Map(jobs.map(j => [`${normalize(j.company)}_${normalize(j.position)}`, j]))
      const jobByCompany = new Map(jobs.map(j => [normalize(j.company), j]))
      const findExisting = p => {
        // Exact company+position match first
        const key = `${normalize(p.company)}_${normalize(p.position)}`
        if (jobByKey.has(key)) return jobByKey.get(key)

        const normCo = normalize(p.company)
        // Fall back to company-only if the PARSED position is generic.
        // (e.g. a "Thank you for applying" confirmation that carries no job title)
        if (isGenericPos(p.position)) {
          return jobByCompany.get(normCo) || null
        }

        // Position-compatible company match: when an email at a known company
        // gives a slightly different but related title (e.g. "Product Manager"
        // vs the tracked "Product Manager - Mobile"), treat it as the same job.
        // One title being a substring of the other = same role family. Without
        // this, the email is wrongly imported as a NEW job and the existing
        // one never gets its status upgraded (Bug: refresh didn't update status).
        const candidate = jobByCompany.get(normCo)
        if (candidate) {
          const newPos = normalize(p.position)
          const existPos = normalize(candidate.position)
          if (
            isGenericPos(candidate.position) ||
            (newPos && existPos && (newPos.includes(existPos) || existPos.includes(newPos)))
          ) {
            return candidate
          }
        }
        return null
      }

      let added = 0, updated = 0, skipped = 0
      const now = new Date().toISOString()
      // Track newly added jobs in THIS batch to prevent duplicates within same refresh cycle
      // Map of batchKey → { jobId, data }
      const newJobsThisBatch = new Map()

      for (const p of grouped) {
        const existing = findExisting(p)
        // Also check if this job was already added earlier in THIS batch
        const batchKey = `${normalize(p.company)}_${normalize(p.position)}`
        const batchEntry = newJobsThisBatch.get(batchKey)
        const alreadyAddedThisBatch = !!batchEntry

        // Skip re-importing jobs that were explicitly deleted
        if (!existing && !alreadyAddedThisBatch && isDeletedJob(p.company, p.position)) {
          log(`⏭️  Skipped deleted job: ${p.company}/${p.position}`)
          skipped++
          continue
        }

        if (!existing && !alreadyAddedThisBatch) {
          // New job — add it with lastSyncTime
          log(`➕ Adding new job: ${p.company}/${p.position} (${p.status}, ${p.history?.length || 0} history entries)`)
          const newJob = addJob({
            company: p.company || 'Inconnu',
            position: p.position || 'Poste non précisé',
            url: '', status: p.status || 'sent',
            date: p.date || new Date().toISOString().split('T')[0],
            notes: p.notes || '',
            lastSyncTime: now,
            _history: p.history?.length > 0 ? p.history : undefined,
            ...(p.positionLinks && { positionLinks: p.positionLinks }),
          })
          // Track that we added this job in this batch (with its ID for later merging)
          newJobsThisBatch.set(batchKey, { jobId: newJob.id, data: newJob })
          added++
        } else if (alreadyAddedThisBatch) {
          // Duplicate detected in this batch — merge history into the first one we added
          log(`🔄 Merging duplicate in batch: ${p.company}/${p.position} (${p.history?.length || 0} new history entries)`)
          const { jobId, data: firstJobData } = batchEntry

          // Merge new history entries from this duplicate into the first job
          if (p.history?.length > 0) {
            const normNote = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 80)
            const existingHistKeys = new Set(
              (firstJobData.history || []).flatMap(h =>
                (h.note || '').split(' | ').map(n => `${h.date}_${normNote(n)}`)
              )
            )
            const newEntries = p.history.filter(h => !existingHistKeys.has(`${h.date}_${normNote(h.note)}`))

            if (newEntries.length > 0) {
              const merged = [...(firstJobData.history || []), ...newEntries]
                .sort((a, b) => new Date(a.date) - new Date(b.date))
              const deduplicated = deduplicateHistoryBySemantics(merged)
              const mergedHistory = mergeHistoryBySameDayTopic(autoCompletePastMeetings(deduplicated))

              // Merge position links from this duplicate too
              const allLinks = [...new Set([...(firstJobData.positionLinks || []), ...(p.positionLinks || [])])]

              updateJob(jobId, {
                history: mergedHistory,
                positionLinks: allLinks.length > 0 ? allLinks : undefined,
                lastSyncTime: now
              })

              // Update tracked batch entry with merged data
              newJobsThisBatch.set(batchKey, {
                jobId,
                data: { ...firstJobData, history: mergedHistory, positionLinks: allLinks }
              })
            }
          }
          skipped++
        } else {
          // Existing job — merge any new history entries
          const normNote = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 80)
          // Expand merged notes (stored as "note1 | note2") so individual notes match too
          const existingHistKeys = new Set(
            (existing.history || []).flatMap(h =>
              (h.note || '').split(' | ').map(n => `${h.date}_${normNote(n)}`)
            )
          )
          const newEntries = (p.history || []).filter(h => !existingHistKeys.has(`${h.date}_${normNote(h.note)}`))
          if (newEntries.length > 0) {
            log(`📝 Updating ${p.company}/${p.position}: adding ${newEntries.length} new history entries`)
            const merged = [...(existing.history || []), ...newEntries]
              .sort((a, b) => new Date(a.date) - new Date(b.date))
            const deduplicated = deduplicateHistoryBySemantics(merged)
            const mergedHistory = mergeHistoryBySameDayTopic(autoCompletePastMeetings(deduplicated))
            // Upgrade status if new emails show a higher-priority status.
            const pIdx = STATUS_ORDER.indexOf(p.status)
            const exIdx = STATUS_ORDER.indexOf(existing.status)
            let newStatus = pIdx > exIdx ? p.status : existing.status
            // Guard: an unrecognized parsed status returns indexOf === -1, which
            // is never > 0, so a job stuck at 'todo' (index 0) would silently
            // stay 'todo' even though an inbound email clearly means it has
            // progressed (Bug: Dashlane stayed "À faire" after a confirmation
            // email). A 'todo' job receiving any real email signal moves forward
            // to the parsed status, or 'reviewing' when that status is unknown.
            if (existing.status === 'todo' && newStatus === 'todo') {
              newStatus = STATUS_ORDER.includes(p.status) ? p.status : 'reviewing'
            }
            log(`   ↳ ${existing.company}: status ${existing.status} → ${newStatus} (parsed: ${p.status})`)
            const updatePayload = { history: mergedHistory, status: newStatus, lastSyncTime: now }
            // Add position links if found (merge with existing if any)
            if (p.positionLinks?.length) {
              const existingLinks = new Set(existing.positionLinks || [])
              const allLinks = [...existingLinks, ...p.positionLinks]
              updatePayload.positionLinks = [...new Set(allLinks)]
            }
            updateJob(existing.id, updatePayload)
            updated++
          } else {
            // No new entries but still update lastSyncTime to avoid re-fetching same emails
            const updatePayload = { lastSyncTime: now }
            // Add position links if found
            if (p.positionLinks?.length) {
              const existingLinks = new Set(existing.positionLinks || [])
              const allLinks = [...existingLinks, ...p.positionLinks]
              updatePayload.positionLinks = [...new Set(allLinks)]
            }
            updateJob(existing.id, updatePayload)
          }
        }
      }

      if (!silent && (added > 0 || updated > 0)) {
        const parts = []
        if (added > 0) parts.push(`${added} nouvelle${added > 1 ? 's' : ''} candidature${added > 1 ? 's' : ''}`)
        if (updated > 0) parts.push(`${updated} mise${updated > 1 ? 's' : ''} à jour`)
        showToast(`✨ ${parts.join(' · ')} !`, 4000)
      }

      const nowDate = new Date()
      localStorage.setItem(REFRESH_KEY, nowDate.toISOString())
      setLastRefresh(nowDate)

      // Re-run dedup/merge pipeline so duplicates disappear immediately
      if (reprocessJobsRef.current) reprocessJobsRef.current()
    } catch (e) {
      console.warn('Auto-refresh failed:', e.message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!isConnected()) return

    // Check if refresh is needed
    const checkAndRefresh = () => {
      // Skip auto-scan on first-ever load (when no lastRefresh is set)
      // Supabase fetch during app init already provides all historical jobs
      // Only auto-scan on subsequent loads if enough time has passed
      if (!lastRefresh) {
        log('🔄 First load: skipping auto-scan, relying on Supabase fetch')
        return
      }

      const hoursSinceRefresh = (new Date() - lastRefresh) / (1000 * 60 * 60)

      if (hoursSinceRefresh >= REFRESH_INTERVAL_HOURS) {
        log(`📧 Auto-scanning Gmail: ${Math.round(hoursSinceRefresh)}h since last sync`)
        doRefresh(true)
      }
    }

    // Immediate check if needed
    checkAndRefresh()

    // Set up periodic polling every 10 minutes to check if refresh is due
    const interval = setInterval(checkAndRefresh, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [lastRefresh, doRefresh])

  const formatLastRefresh = () => {
    if (!lastRefresh) return null
    const mins = Math.round((new Date() - lastRefresh) / 60000)
    if (mins < 1) return 'à l\'instant'
    if (mins < 60) return `il y a ${mins} min`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `il y a ${hours}h`
    return `il y a ${Math.round(hours / 24)}j`
  }

  return { refreshing, lastRefresh: formatLastRefresh(), doRefresh }
}
