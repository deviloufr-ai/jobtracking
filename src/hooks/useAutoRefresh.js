import { useState, useEffect, useRef } from 'react'
import { isConnected, fetchJobEmails } from '../services/gmail'
import { parseEmailsForJobs } from '../services/claude'
import { fetchCalendarEvents } from '../services/calendar'
import { isAtsRejection } from './useJobs'

const REFRESH_KEY = 'jobtrackr_last_refresh'
const REFRESH_INTERVAL_HOURS = 6

const STATUS_ORDER = ['todo','sent','reviewing','interview','waiting','offer','rejected','rejected_ats','cancelled','archived']

function normalize(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '') }

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

  const enriched = parsed.map(p => ({
    ...p,
    status: p.status === 'rejected' && isAtsRejection(p.notes || '') ? 'rejected_ats' : p.status
  }))

  const emailByGmailId = Object.fromEntries(emails.map(e => [e.id, e]))

  const jobGroups = new Map()
  for (const p of enriched) {
    if (!p.company) continue
    const key = `${normalize(p.company)}_${normalize(p.position || '')}`
    if (!jobGroups.has(key)) jobGroups.set(key, [])
    jobGroups.get(key).push(p)
  }

  const grouped = []
  for (const [, emailsForJob] of jobGroups) {
    const sorted = [...emailsForJob].sort((a, b) => new Date(a.date) - new Date(b.date))
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
    grouped.push({
      ...latest,
      date: sorted[0].date,
      status: highestStatus,
      history: mergedHistory,
      notes: sorted.map(e => e.notes).filter(Boolean).join(' | '),
    })
  }
  return grouped
}

export function useAutoRefresh(jobs, addJob, showToast) {
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
      const [emails, calendarEvents] = await Promise.all([
        fetchJobEmails(100, months),
        fetchCalendarEvents('', months).catch(() => []),
      ])
      if (!emails.length) { setRefreshing(false); return }

      const grouped = await buildJobsFromEmails(emails, calendarEvents)
      if (!grouped.length) { setRefreshing(false); return }

      const existingKeys = new Set(jobs.map(j => `${normalize(j.company)}_${normalize(j.position)}`))
      const newJobs = grouped.filter(p => !existingKeys.has(`${normalize(p.company)}_${normalize(p.position)}`))

      if (newJobs.length > 0) {
        newJobs.forEach(j => addJob({
          company: j.company || 'Inconnu',
          position: j.position || 'Poste non précisé',
          url: '',
          status: j.status || 'sent',
          date: j.date || new Date().toISOString().split('T')[0],
          notes: j.notes || '',
          _history: j.history?.length > 0 ? j.history : undefined,
        }))
        if (!silent) {
          showToast(`✨ ${newJobs.length} nouvelle${newJobs.length > 1 ? 's' : ''} candidature${newJobs.length > 1 ? 's' : ''} importée${newJobs.length > 1 ? 's' : ''} !`, 4000)
        }
      }

      const now = new Date()
      localStorage.setItem(REFRESH_KEY, now.toISOString())
      setLastRefresh(now)
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
