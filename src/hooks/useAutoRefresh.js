import { useState, useEffect, useRef, useCallback } from 'react'
import { isConnected, fetchJobEmails, fetchJobEmailsForAccount, getConnectedAccounts, getCachedUser } from '../services/gmail'
import { parseEmailsForJobs } from '../services/claude'
import { fetchCalendarEvents } from '../services/calendar'
import { isAtsRejection, isDeletedJob } from './useJobs'
import { normalize, isJobBoard } from '../constants/jobBoards'

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
          // Mark previous entry as done since the meeting happened
          prevEntry.status = 'done'
          prevEntry.note = `${prevEntry.note} ✓`
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
export async function buildJobsFromEmails(emails, calendarEvents = []) {
  const parsed = await parseEmailsForJobs(emails)
  if (!parsed.length) {
    console.log(`📧 Claude parsed ${emails.length} emails but found no job candidatures`)
    return []
  }
  console.log(`📊 Claude parsed ${emails.length} emails → ${parsed.length} job signals (confidence >= 35)`)

  const enriched = parsed
    .filter(p => {
      const isBoard = isJobBoard(p.company)
      if (isBoard) {
        console.log(`🗑️  Filtered job board: ${p.company}/${p.position}`)
      }
      return p.company && !isBoard
    })
    .map(p => ({
      ...p,
      status: p.status === 'rejected' && isAtsRejection(p.notes || '') ? 'rejected_ats' : p.status
    }))

  console.log(`📋 After filtering job boards: ${enriched.length} signals remain`)

  const emailByGmailId = Object.fromEntries(emails.map(e => [e.id, e]))

  const SUGGESTION_KEYWORDS = ['suggérée', 'suggested job', 'job suggestion', 'alerte indeed', 'alerte emploi', 'job alert', 'recommended job', 'recommandée', 'offre recommandée', 'pas de candidature confirmée', 'offre correspondante']
  const isSuggestion = p => SUGGESTION_KEYWORDS.some(k => (p.notes || '').toLowerCase().includes(k))

  const GENERIC_POS = ['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', '']
  const isGenericPos = pos => GENERIC_POS.includes((pos || '').toLowerCase().trim())

  const jobGroups = new Map()
  for (const p of enriched) {
    if (!p.company) continue
    if (isSuggestion(p)) continue
    // Group by company + position so different roles at same company stay separate
    // "Joko/Lead Product Manager" ≠ "Joko/Product Manager"
    const companyKey = normalize(p.company)
    const posKey = (p.position || '').toLowerCase().trim()
    const key = isGenericPos(p.position) ? companyKey : `${companyKey}|||${posKey}`
    if (!jobGroups.has(key)) jobGroups.set(key, [])
    jobGroups.get(key).push(p)
  }

  console.log(`🏢 Grouping into companies: ${jobGroups.size} unique company/position combinations`)
  const grouped = []
  for (const [key, emailsForJob] of jobGroups) {
    console.log(`  └─ ${key}: ${emailsForJob.length} emails`)
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

    // Consolidate same-date email entries into one summary
    const consolidatedHistory = []
    const byDate = new Map()
    for (const h of history) {
      if (!byDate.has(h.date)) byDate.set(h.date, [])
      byDate.get(h.date).push(h)
    }
    for (const [date, entries] of byDate) {
      if (entries.length === 1) {
        consolidatedHistory.push(entries[0])
      } else {
        // Merge multiple entries on same date into one
        const primary = entries[0]
        const notes = entries
          .map(e => e.note)
          .filter(Boolean)
          .join(' | ')
        const gmailIds = []
        let bestLink = null
        for (const e of entries) {
          if (e.gmailId && !gmailIds.includes(e.gmailId)) gmailIds.push(e.gmailId)
          if (!bestLink && e.meetingLink) bestLink = e.meetingLink
        }
        consolidatedHistory.push({
          ...primary,
          note: notes,
          gmailIds: gmailIds.length > 1 ? gmailIds : undefined,
          gmailId: gmailIds.length === 1 ? gmailIds[0] : primary.gmailId,
          meetingLink: bestLink || primary.meetingLink
        })
      }
    }

    const existingKeys = new Set(consolidatedHistory.map(h => `${h.date}-${h.status}`))
    const newCalEntries = calEntries.filter(e => !existingKeys.has(`${e.date}-${e.status}`))
    const merged = [...consolidatedHistory, ...newCalEntries].sort((a, b) => new Date(a.date) - new Date(b.date))
    const deduplicated = deduplicateHistoryBySemantics(merged)
    const mergedHistory = autoCompletePastMeetings(deduplicated)

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

    grouped.push({
      ...latest,
      position: bestPosition,
      date: sorted[0].date,
      status: highestStatus,
      history: mergedHistory,
      notes: sorted.map(e => e.notes).filter(Boolean).join(' | '),
      _emailBody: emailBodies || undefined,
      ...(allUpdateOnly && { _updateOnly: true }),
    })
  }
  return grouped
}

export function useAutoRefresh(jobs, addJob, updateJob, showToast, reprocessJobs) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() => {
    const stored = localStorage.getItem(REFRESH_KEY)
    return stored ? new Date(stored) : null
  })
  const hasRunRef = useRef(false)
  const jobsRef = useRef(jobs)
  const refreshingRef = useRef(refreshing)
  const reprocessJobsRef = useRef(reprocessJobs)

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

  const doRefresh = useCallback(async (silent = false) => {
    if (!isConnected() || refreshingRef.current) return
    setRefreshing(true)

    try {
      // Simple time-based sync: scan last 2 weeks to catch new emails
      // (Not lastSyncTime-based to avoid Gmail indexing delays)
      // Duplicate detection + history merge prevents re-importing same emails
      const months = 14/30

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

      const grouped = await buildJobsFromEmails(emails, calendarEvents)
      if (!grouped.length) {
        console.log('📭 No jobs extracted from emails (all filtered or no matches)')
        return
      }

      console.log(`✅ Extracted ${grouped.length} jobs from emails`)

      const GENERIC_POS = ['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', '']
      const isGenericPos = pos => GENERIC_POS.includes((pos || '').toLowerCase().trim())

      const jobByKey = new Map(jobs.map(j => [`${normalize(j.company)}_${normalize(j.position)}`, j]))
      const jobByCompany = new Map(jobs.map(j => [normalize(j.company), j]))
      const findExisting = p => {
        // Exact company+position match first
        const key = `${normalize(p.company)}_${normalize(p.position)}`
        if (jobByKey.has(key)) return jobByKey.get(key)
        // Fall back to company-only ONLY if position is generic
        // Don't merge "Product Manager" + "Lead Product Manager" at same company
        if (isGenericPos(p.position)) {
          return jobByCompany.get(normalize(p.company)) || null
        }
        return null
      }

      let added = 0, updated = 0, skipped = 0
      const now = new Date().toISOString()
      for (const p of grouped) {
        const existing = findExisting(p)

        // Skip re-importing jobs that were explicitly deleted
        if (!existing && isDeletedJob(p.company, p.position)) {
          console.log(`⏭️  Skipped deleted job: ${p.company}/${p.position}`)
          skipped++
          continue
        }

        if (!existing) {
          // New job — add it with lastSyncTime
          console.log(`➕ Adding new job: ${p.company}/${p.position} (${p.status}, ${p.history?.length || 0} history entries)`)
          addJob({
            company: p.company || 'Inconnu',
            position: p.position || 'Poste non précisé',
            url: '', status: p.status || 'sent',
            date: p.date || new Date().toISOString().split('T')[0],
            notes: p.notes || '',
            lastSyncTime: now,
            _history: p.history?.length > 0 ? p.history : undefined,
          })
          added++
        } else {
          // Existing job — merge any new history entries
          const normNote = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 80)
          // Expand merged notes (stored as "note1 · note2") so individual notes match too
          const existingHistKeys = new Set(
            (existing.history || []).flatMap(h =>
              (h.note || '').split(' · ').map(n => `${h.date}_${normNote(n)}`)
            )
          )
          const newEntries = (p.history || []).filter(h => !existingHistKeys.has(`${h.date}_${normNote(h.note)}`))
          if (newEntries.length > 0) {
            console.log(`📝 Updating ${p.company}/${p.position}: adding ${newEntries.length} new history entries`)
            const merged = [...(existing.history || []), ...newEntries]
              .sort((a, b) => new Date(a.date) - new Date(b.date))
            const deduplicated = deduplicateHistoryBySemantics(merged)
            const mergedHistory = autoCompletePastMeetings(deduplicated)
            // Upgrade status if new emails show a higher-priority status
            const newStatus = STATUS_ORDER.indexOf(p.status) > STATUS_ORDER.indexOf(existing.status)
              ? p.status : existing.status
            updateJob(existing.id, { history: mergedHistory, status: newStatus, lastSyncTime: now })
            updated++
          } else {
            // No new entries but still update lastSyncTime to avoid re-fetching same emails
            updateJob(existing.id, { lastSyncTime: now })
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
        console.log('🔄 First load: skipping auto-scan, relying on Supabase fetch')
        return
      }

      const hoursSinceRefresh = (new Date() - lastRefresh) / (1000 * 60 * 60)

      if (hoursSinceRefresh >= REFRESH_INTERVAL_HOURS) {
        console.log(`📧 Auto-scanning Gmail: ${Math.round(hoursSinceRefresh)}h since last sync`)
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
