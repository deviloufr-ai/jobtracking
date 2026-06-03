import { useState, useEffect, useRef } from 'react'
import { isConnected, fetchJobEmails } from '../services/gmail'
import { parseEmailsForJobs } from '../services/claude'
import { deduplicateJobs, isAtsRejection } from './useJobs'

const REFRESH_KEY = 'jobtrackr_last_refresh'
const REFRESH_INTERVAL_HOURS = 6 // auto-refresh every 6 hours

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function useAutoRefresh(jobs, addJob, showToast) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() => {
    const stored = localStorage.getItem(REFRESH_KEY)
    return stored ? new Date(stored) : null
  })
  const hasRunRef = useRef(false)

  const doRefresh = async (silent = false) => {
    if (!isConnected()) return
    if (refreshing) return

    setRefreshing(true)
    try {
      const emails = await fetchJobEmails(100, 3)
      if (emails.length === 0) { setRefreshing(false); return }

      const parsed = await parseEmailsForJobs(emails)
      if (!parsed.length) { setRefreshing(false); return }

      // Enrich with ATS detection
      const enriched = parsed.map(p => ({
        ...p,
        status: p.status === 'rejected' && isAtsRejection(p.notes || '') ? 'rejected_ats' : p.status
      }))

      // Dedup within parsed
      const deduped = deduplicateJobs(enriched)

      // Filter out existing
      const existingNames = jobs.map(j => normalize(j.company))
      const newJobs = deduped.filter(p =>
        p.company && !existingNames.includes(normalize(p.company))
      )

      if (newJobs.length > 0) {
        newJobs.forEach(j => addJob({
          company: j.company || 'Inconnu',
          position: j.position || 'Poste non précisé',
          url: '',
          status: j.status || 'sent',
          date: j.date || new Date().toISOString().split('T')[0],
          notes: j.notes || '',
        }))
        if (!silent) {
          showToast(`✨ ${newJobs.length} nouvelle${newJobs.length > 1 ? 's' : ''} candidature${newJobs.length > 1 ? 's' : ''} importée${newJobs.length > 1 ? 's' : ''} !`, 4000)
          setTimeout(() => window.location.reload(), 2000)
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

  // Auto-refresh on page load if Gmail connected and last refresh > 6h ago
  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true

    if (!isConnected()) return

    const now = new Date()
    const hoursSinceRefresh = lastRefresh
      ? (now - lastRefresh) / (1000 * 60 * 60)
      : Infinity

    if (hoursSinceRefresh >= REFRESH_INTERVAL_HOURS) {
      // Small delay to let app load first
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
