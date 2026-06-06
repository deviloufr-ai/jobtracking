import { useState, useEffect, useRef } from 'react'
import { isConnected, fetchJobEmails, fetchJobEmailsForAccount, getConnectedAccounts, getCachedUser } from '../services/gmail'
import { parseEmailsForJobs } from '../services/claude'
import { fetchCalendarEvents } from '../services/calendar'
import { isAtsRejection } from './useJobs'

const REFRESH_KEY = 'jobtrackr_last_refresh'
const REFRESH_INTERVAL_HOURS = 6

const STATUS_ORDER = ['todo','sent','reviewing','interview','done','waiting','offer','rejected','rejected_ats','cancelled','archived']

function normalize(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '') }

const JOB_BOARDS = new Set([
  'linkedin','indeed','welcometothejungle','wttj','apec','monster','cadremploi',
  'hellowork','freework','malt','jobteaser','glassdoor','meteojob','regionsjob',
  'keljob','poleemploi','francetravail','talentio','otta','remixjobs','remotive',
  'jobboard','smartrecruiters','workday','greenhouse','lever','ashby','jobvite',
])

function isJobBoard(company) {
  return JOB_BOARDS.has(normalize(company))
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
  if (!parsed.length) return []

  const enriched = parsed
    .filter(p => p.company && !isJobBoard(p.company))  // drop job board names
    .map(p => ({
      ...p,
      status: p.status === 'rejected' && isAtsRejection(p.notes || '') ? 'rejected_ats' : p.status
    }))

  const emailByGmailId = Object.fromEntries(emails.map(e => [e.id, e]))

  const SUGGESTION_KEYWORDS = ['suggérée', 'suggested job', 'job suggestion', 'alerte indeed', 'alerte emploi', 'job alert', 'recommended job', 'recommandée', 'offre recommandée', 'pas de candidature confirmée', 'offre correspondante']
  const isSuggestion = p => SUGGESTION_KEYWORDS.some(k => (p.notes || '').toLowerCase().includes(k))

  const GENERIC_POS = ['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', '']
  const isGenericPos = pos => GENERIC_POS.includes((pos || '').toLowerCase().trim())

  const jobGroups = new Map()
  for (const p of enriched) {
    if (!p.company) continue
    if (isSuggestion(p)) continue
    // Group by company-only so "Publidata/ProductManager" and "Publidata/Unknown"
    // don't create two groups that both update the same job with duplicate history
    const key = normalize(p.company)
    if (!jobGroups.has(key)) jobGroups.set(key, [])
    jobGroups.get(key).push(p)
  }

  const grouped = []
  for (const [, emailsForJob] of jobGroups) {
    const sorted = [...emailsForJob].sort((a, b) => new Date(a.date) - new Date(b.date))
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
        return {
          date: e.date,
          status: e.type === 'interview' ? 'interview' : e.type === 'offer' ? 'offer' : 'waiting',
          note: `📅 ${e.title}${e.isUpcoming ? ' (à venir)' : ''}`,
          source: 'calendar', isUpcoming: e.isUpcoming,
          ...(meetingLink && { meetingLink }),
        }
      })

    const existingKeys = new Set(history.map(h => `${h.date}-${h.status}`))
    const newCalEntries = calEntries.filter(e => !existingKeys.has(`${e.date}-${e.status}`))
    const mergedHistory = [...history, ...newCalEntries].sort((a, b) => new Date(a.date) - new Date(b.date))

    const latest = sorted[sorted.length - 1]
    // Pick best position: prefer non-generic over "Unknown"
    const bestPosition = sorted.map(e => e.position || '').find(p => !isGenericPos(p)) || latest.position

    grouped.push({
      ...latest,
      position: bestPosition,
      date: sorted[0].date,
      status: highestStatus,
      history: mergedHistory,
      notes: sorted.map(e => e.notes).filter(Boolean).join(' | '),
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

  const doRefresh = async (silent = false) => {
    if (!isConnected() || refreshing) return
    setRefreshing(true)
    try {
      const months = 3
      // Fetch from all connected accounts and merge, tagging each email with its account
      const connectedAccts = getConnectedAccounts()
      let allEmails = []
      if (connectedAccts.length > 1) {
        const perAccount = await Promise.all(
          connectedAccts.map(acct =>
            fetchJobEmailsForAccount(acct.email, 100, months)
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
        allEmails = await fetchJobEmails(100, months)
      }
      const [emails, calendarEvents] = await Promise.all([
        Promise.resolve(allEmails),
        fetchCalendarEvents('', months).catch(() => []),
      ])
      if (!emails.length) { setRefreshing(false); return }

      const grouped = await buildJobsFromEmails(emails, calendarEvents)
      if (!grouped.length) { setRefreshing(false); return }

      const jobByKey = new Map(jobs.map(j => [`${normalize(j.company)}_${normalize(j.position)}`, j]))
      const jobByCompany = new Map(jobs.map(j => [normalize(j.company), j]))
      const findExisting = p => {
        // Exact company+position match first
        const key = `${normalize(p.company)}_${normalize(p.position)}`
        if (jobByKey.has(key)) return jobByKey.get(key)
        // Fall back to company-only: LinkedIn/job boards often give a different
        // position title than what was originally imported — still the same application
        return jobByCompany.get(normalize(p.company)) || null
      }

      let added = 0, updated = 0
      for (const p of grouped) {
        const existing = findExisting(p)

        if (!existing) {
          // New job — add it
          addJob({
            company: p.company || 'Inconnu',
            position: p.position || 'Poste non précisé',
            url: '', status: p.status || 'sent',
            date: p.date || new Date().toISOString().split('T')[0],
            notes: p.notes || '',
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
            const mergedHistory = [...(existing.history || []), ...newEntries]
              .sort((a, b) => new Date(a.date) - new Date(b.date))
            // Upgrade status if new emails show a higher-priority status
            const newStatus = STATUS_ORDER.indexOf(p.status) > STATUS_ORDER.indexOf(existing.status)
              ? p.status : existing.status
            updateJob(existing.id, { history: mergedHistory, status: newStatus })
            updated++
          }
        }
      }

      if (!silent && (added > 0 || updated > 0)) {
        const parts = []
        if (added > 0) parts.push(`${added} nouvelle${added > 1 ? 's' : ''} candidature${added > 1 ? 's' : ''}`)
        if (updated > 0) parts.push(`${updated} mise${updated > 1 ? 's' : ''} à jour`)
        showToast(`✨ ${parts.join(' · ')} !`, 4000)
      }

      const now = new Date()
      localStorage.setItem(REFRESH_KEY, now.toISOString())
      setLastRefresh(now)

      // Re-run dedup/merge pipeline so duplicates disappear immediately
      if (reprocessJobs) reprocessJobs()
    } catch (e) {
      console.warn('Auto-refresh failed:', e.message)
    }
    setRefreshing(false)
  }

  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true
    if (!isConnected()) return
    const hoursSinceRefresh = lastRefresh
      ? (new Date() - lastRefresh) / (1000 * 60 * 60)
      : Infinity
    if (hoursSinceRefresh >= REFRESH_INTERVAL_HOURS) {
      setTimeout(() => doRefresh(true), 2000)
    }
  }, [])

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
