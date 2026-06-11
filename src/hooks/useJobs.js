import { useState, useEffect, useMemo } from 'react'
import { loadSettings } from './useSettings'
import { extractUrlsFromEmail, rankUrlsByJobRelevance, checkPositionUrl } from '../services/positionChecker'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'
import { supabase } from '../services/supabase'
import { getSyncUserIdForSupabase } from '../services/gmail'

const ENRICH_TTL_DAYS = 30

export function isEnriched(job) {
  if (!job?.enrichedAt) return false
  const age = (Date.now() - new Date(job.enrichedAt).getTime()) / (1000 * 60 * 60 * 24)
  return age < ENRICH_TTL_DAYS
}

export function needsEnrichment(job) {
  return !isEnriched(job)
}

const ATS_DOMAINS = [
  'ashbyhq.com', 'greenhouse.io', 'lever.co', 'workable.com',
  'recruitee.com', 'bamboohr.com', 'smartrecruiters.com', 'taleo.net',
  'successfactors.com', 'jobvite.com', 'icims.com', 'myworkdayjobs.com',
  'teamtailor.com', 'breezy.hr', 'pinpoint.com', 'dover.com',
  'comeet.com', 'jazz.co', 'rippling.com', 'notion.so'
]

export function isAtsRejection(notes = '', fromEmail = '') {
  const atsMatch = ATS_DOMAINS.some(d => fromEmail.toLowerCase().includes(d))
  const rejectionKeywords = ['not be moving forward', 'not moving forward', 'not selected',
    'we regret', 'nous avons le regret', 'no longer being considered',
    'decided to move forward with other', 'not an ideal fit', 'filled the position']
  const isRejection = rejectionKeywords.some(k => notes.toLowerCase().includes(k))
  return atsMatch || isRejection
}

// Helper: ensure history is always sorted by date (chronological order)
export function sortJobHistory(job) {
  if (!job?.history?.length) return job
  return {
    ...job,
    history: [...job.history].sort((a, b) => new Date(a.date) - new Date(b.date))
  }
}

export const STATUSES = [
  { key: 'todo',         label: 'À postuler',         color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  { key: 'sent',         label: 'Envoyée',           color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  { key: 'reviewing',    label: "En cours d'examen",  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  { key: 'interview',    label: 'Entretien planifié',  color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'done',         label: 'Traité',              color: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-500' },
  { key: 'waiting',      label: 'En attente',          color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { key: 'offer',        label: 'Offre reçue',         color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  { key: 'rejected',     label: 'Refusée',             color: 'bg-red-100 text-red-700',       dot: 'bg-red-400' },
  { key: 'rejected_ats', label: 'Refus ATS',           color: 'bg-rose-100 text-rose-600',     dot: 'bg-rose-400' },
  { key: 'cancelled',    label: 'Annulée',             color: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400' },
  { key: 'archived',    label: 'Archivée',            color: 'bg-slate-100 text-slate-400',   dot: 'bg-slate-300' },
]

export function getStatus(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0]
}

function normalizeCompany(name = '') {
  return name.toLowerCase()
    .replace(/\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?\s*$/i, '')
    .replace(/\.(io|com|fr|co|net|org|eu|de|uk|be|ch|ca|us|tech|dev)\s*$/i, '')
    .replace(/\b(technologies|digital|solutions|group|labs|studio|hq|services|consulting|innovation|ventures|project|projects)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
}

const STATUS_PRIORITY = {
  cancelled: 0, sent: 1, reviewing: 2, waiting: 3,
  interview: 4, done: 4, offer: 5, rejected: 6, rejected_ats: 6
}

// Import all the deduplication/processing functions from original useJobs
// (These are pure functions, no changes needed)
export function deduplicateJobs(jobs) {
  const GENERIC_POS_SET = new Set(['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', ''])
  const normPos = p => (p || '').toLowerCase().trim().replace(/\s*[hf]\/[hf]\s*/gi, '').trim()
  const isGenericPos = p => GENERIC_POS_SET.has(normPos(p))

  const groups = new Map()
  for (const job of jobs) {
    const co = normalizeCompany(job.company)
    const pos = normPos(job.position)
    const key = isGenericPos(job.position) ? co : `${co}|||${pos}`
    if (!groups.has(key)) {
      groups.set(key, [job])
    } else {
      groups.get(key).push(job)
    }
  }

  const realGroups = new Map()
  const genericByCompany = new Map()
  for (const [key, group] of groups) {
    if (key.includes('|||')) {
      realGroups.set(key, group)
    } else {
      const existing = genericByCompany.get(key)
      genericByCompany.set(key, existing ? [...existing, ...group] : group)
    }
  }

  for (const [co, genericJobs] of genericByCompany) {
    let merged = false
    for (const [key, realJobs] of realGroups) {
      if (key.startsWith(co + '|||')) {
        realJobs.push(...genericJobs)
        merged = true
        break
      }
    }
    if (!merged) {
      realGroups.set(co, genericJobs)
    }
  }
  groups.clear()
  for (const [key, group] of realGroups) {
    groups.set(key, group)
  }

  const result = []
  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }

    group.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 1
      const pb = STATUS_PRIORITY[b.status] ?? 1
      if (pb !== pa) return pb - pa
      return new Date(b.date) - new Date(a.date)
    })

    const realPositions = [...new Set(group.map(j => normPos(j.position)).filter(p => !GENERIC_POS_SET.has(p)))]
    if (realPositions.length > 1) {
      group.forEach(j => result.push(j))
      continue
    }

    const TERMINAL = ['rejected', 'rejected_ats', 'cancelled']
    const hasTerminal = group.some(j => TERMINAL.includes(j.status))
    if (group.length > 1) {
      const dates = group.map(j => new Date(j.date).getTime())
      const span = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)
      const threshold = hasTerminal ? 60 : 90
      if (span > threshold) {
        group.forEach(j => result.push(j))
        continue
      }
    }

    const primary = group[0]

    const GENERIC_POSITIONS = ['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', '']
    const bestPosition = group
      .map(j => j.position || '')
      .find(p => !GENERIC_POSITIONS.includes(p.toLowerCase().trim()))
      || primary.position

    const allHistory = group.flatMap(j => j.history || [])
    allHistory.sort((a, b) => new Date(a.date) - new Date(b.date))

    const seenHistory = new Set()
    const mergedHistory = allHistory.filter(h => {
      const normNote = (h.note || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
      const k = `${h.date}_${normNote}`
      if (seenHistory.has(k)) return false
      seenHistory.add(k)
      return true
    })

    const allNotes = [...new Set(group.map(j => j.notes).filter(Boolean))].join(' | ')

    const latestEnrichedAt = group
      .map(j => j.enrichedAt)
      .filter(Boolean)
      .sort()
      .pop()

    const merged = { ...primary }
    for (const job of group.slice(1)) {
      for (const [key, value] of Object.entries(job)) {
        if (['id', 'position', 'notes', 'history', 'enrichedAt', 'updatedAt'].includes(key)) continue
        if (!merged[key] && value) {
          merged[key] = value
        }
      }
    }

    result.push({
      ...merged,
      position: bestPosition,
      notes: allNotes || primary.notes,
      history: mergedHistory,
      enrichedAt: latestEnrichedAt || primary.enrichedAt,
      _merged: group.length > 1 ? group.length : undefined
    })
  }

  return result
}

function splitPipeNotes(jobs) {
  return jobs.map(j => {
    if (!j.history) return j
    const expanded = []
    for (const entry of j.history) {
      if (entry.note && entry.note.includes(' | ')) {
        const parts = entry.note.split(' | ').map(p => p.trim()).filter(Boolean)
        const allMeaningful = parts.every(p => p.length >= 10)
        if (allMeaningful && parts.length >= 2) {
          parts.forEach(part => expanded.push({ ...entry, note: part }))
        } else {
          expanded.push(entry)
        }
      } else {
        expanded.push(entry)
      }
    }
    return { ...j, history: expanded }
  })
}

function deduplicateMeetings(meetings) {
  if (meetings.length <= 1) return meetings

  const normTitle = (note = '') => {
    const clean = note
      .toLowerCase()
      .replace(/^📅\s*/, '')
      .replace(/\(à venir\)|upcoming|today|aujourd'hui|demain|tomorrow/gi, '')
      .replace(/—.*$/, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return clean
  }

  const byDateTitle = new Map()
  for (const meeting of meetings) {
    const key = `${meeting.date}_${normTitle(meeting.note)}`
    if (!byDateTitle.has(key)) {
      byDateTitle.set(key, [meeting])
    } else {
      byDateTitle.get(key).push(meeting)
    }
  }

  const deduped = []
  for (const [, group] of byDateTitle) {
    if (group.length === 1) {
      deduped.push(group[0])
      continue
    }

    const primary = group[0]
    const gmailIds = []
    let bestLink = primary.meetingLink

    for (const m of group) {
      if (m.gmailId && !gmailIds.includes(m.gmailId)) gmailIds.push(m.gmailId)
      if (!bestLink && m.meetingLink) bestLink = m.meetingLink
    }

    deduped.push({
      ...primary,
      meetingLink: bestLink || primary.meetingLink,
      gmailId: gmailIds[0] || primary.gmailId,
      gmailIds: gmailIds.length > 1 ? gmailIds : primary.gmailIds,
    })
  }

  return deduped
}

function mergeSameDateEntries(jobs) {
  return jobs.map(j => {
    if (!j.history || j.history.length <= 1) return j

    const isCalendarEvent = h => h.source === 'calendar' || (h.note && h.note.includes('📅'))
    const calendarEntries = j.history.filter(isCalendarEvent)
    const deduped = deduplicateMeetings(calendarEntries)

    const calendarEntryIds = new Set(deduped.map(d => `${d.date}_${d.note}_${d.meetingLink}`))
    const merged = j.history.filter(h => {
      if (!isCalendarEvent(h)) return true
      const id = `${h.date}_${h.note}_${h.meetingLink}`
      return calendarEntryIds.has(id)
    })

    return { ...j, history: merged }
  })
}

function deduplicateHistory(jobs) {
  return jobs.map(j => {
    if (!j.history || j.history.length <= 1) return j

    const seen = new Set()
    const unique = j.history.filter(h => {
      const normNote = (h.note || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
      const k = `${h.date}_${normNote}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    return { ...j, history: unique }
  })
}

function revalidateArchives(jobs) {
  const settings = loadSettings()
  return jobs.map(j => {
    if (j.status === 'archived') return j

    const daysSince = (date) => (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
    const isSent = ['sent', 'reviewing', 'waiting'].includes(j.status)
    const isRejected = ['rejected', 'rejected_ats', 'cancelled'].includes(j.status)

    if (isSent && daysSince(j.date) > settings.archiveSentDays) {
      return { ...j, status: 'archived' }
    }
    if (isRejected && daysSince(j.date) > settings.archiveRejectedDays) {
      return { ...j, status: 'archived' }
    }

    return j
  })
}

function deduplicateExactMatches(jobs) {
  const seen = new Map()
  const result = []

  for (const job of jobs) {
    const co = normalizeCompany(job.company)
    const pos = (job.position || '').toLowerCase().trim()
    const date = job.date
    const status = job.status

    const key = `${co}|||${pos}|||${date}|||${status}`

    if (seen.has(key)) {
      // Merge with existing: combine notes and history
      const existing = seen.get(key)
      if (job.notes && !existing.notes.includes(job.notes)) {
        existing.notes = existing.notes ? `${existing.notes} | ${job.notes}` : job.notes
      }
      if (job.history && job.history.length > 0) {
        const existingHistoryKeys = new Set(
          (existing.history || []).map(h => `${h.date}_${(h.note || '').slice(0, 50)}`)
        )
        const newEntries = job.history.filter(h => {
          const k = `${h.date}_${(h.note || '').slice(0, 50)}`
          return !existingHistoryKeys.has(k)
        })
        existing.history = [...(existing.history || []), ...newEntries].sort((a, b) => new Date(a.date) - new Date(b.date))
      }
    } else {
      seen.set(key, job)
      result.push(job)
    }
  }

  return result
}

function autoStale(jobs) {
  return revalidateArchives(deduplicateExactMatches(jobs))
}

// Helper to check if a job was previously deleted (for dedup on re-import)
export function isDeletedJob(company, position) {
  // In Supabase version, deleted jobs are truly gone from server
  // This is a no-op but kept for compatibility with useAutoRefresh
  return false
}

// Check if a job with same company+position already exists (for form validation)
export function findDuplicateJob(jobs, company, position) {
  const targetCo = normalizeCompany(company)
  const targetPos = (position || '').toLowerCase().trim()

  for (const job of jobs) {
    const jobCo = normalizeCompany(job.company)
    if (jobCo !== targetCo) continue

    const jobPos = (job.position || '').toLowerCase().trim()
    if (jobPos === targetPos) return job

    // Also check for generic positions (if both are generic, consider it same)
    const GENERIC = new Set(['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', ''])
    if (GENERIC.has(targetPos) && GENERIC.has(jobPos)) return job
  }

  return null
}

// Sync local jobs to Supabase + fetch Supabase jobs (multi-device sync)
async function syncLocalJobsToSupabase(gmailEmail) {
  if (!gmailEmail) return

  try {
    // FETCH jobs from Supabase for this user (other devices' jobs)
    const { data: supabaseJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', gmailEmail)

    if (!fetchError && supabaseJobs?.length) {
      console.log('📥 Fetching', supabaseJobs.length, 'jobs from Supabase...')

      // Fetch history for these jobs
      const { data: allHistory } = await supabase
        .from('job_history')
        .select('*')
        .eq('user_id', gmailEmail)

      const historyByJobId = new Map()
      if (allHistory) {
        allHistory.forEach(entry => {
          if (!historyByJobId.has(entry.job_id)) {
            historyByJobId.set(entry.job_id, [])
          }
          historyByJobId.get(entry.job_id).push(entry)
        })
      }

      // Merge Supabase jobs with history into local IndexedDB
      for (const remoteJob of supabaseJobs) {
        const jobWithHistory = {
          ...remoteJob,
          history: historyByJobId.get(remoteJob.id) || []
        }

        const localJob = await indexeddb.getJob(remoteJob.id)
        if (!localJob) {
          // New job from another device, save it
          await indexeddb.saveJob(jobWithHistory)
          console.log('  ✓ Fetched job:', remoteJob.company)
        }
      }
    }

    // UPLOAD local jobs to Supabase (in case they were added before auth)
    const localJobs = await indexeddb.getAllJobs()
    if (localJobs?.length) {
      console.log('📤 Uploading', localJobs.length, 'local jobs to Supabase...')

      // Check which jobs already exist in Supabase
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('user_id', gmailEmail)

      const existingIds = new Set(existingJobs?.map(j => j.id) || [])

      // Upload jobs that don't exist in Supabase
      for (const job of localJobs) {
        if (!existingIds.has(job.id)) {
          try {
            await syncManager.mutate('jobs', 'insert', job)
            console.log('  ✓ Synced job:', job.company)
          } catch (err) {
            console.warn('  ✗ Failed to sync job:', job.company, err.message)
          }
        }
      }
    }

    console.log('✓ Sync complete')
  } catch (err) {
    console.warn('⚠ Sync failed (non-critical):', err.message)
  }
}

// Main hook
export function useJobs() {
  const [rawJobs, setJobs] = useState([])
  const [settingsKey, setSettingsKey] = useState(0)
  const [loading, setLoading] = useState(true)

  // Load from IndexedDB on mount + when synced from other devices
  useEffect(() => {
    const loadJobs = async () => {
      try {
        await indexeddb.init()
        const cachedJobs = await indexeddb.getAllJobs()
        // Ensure all loaded jobs have sorted history
        const sortedJobs = (cachedJobs || []).map(job => sortJobHistory(job))
        setJobs(sortedJobs)
      } catch (err) {
        console.error('Failed to load jobs from IndexedDB:', err)
        setJobs([])
      } finally {
        setLoading(false)
      }
    }
    loadJobs()

    // Listen for data sync events from polling (multi-device sync)
    const handleSync = (event) => {
      console.log('Data synced from Supabase, reloading...', event.detail)
      loadJobs()
    }
    window.addEventListener('jobtrackr:datasync', handleSync)

    // Sync local jobs to Supabase + fetch Supabase jobs on app load
    const syncUserId = getSyncUserIdForSupabase()
    syncLocalJobsToSupabase(syncUserId)

    return () => window.removeEventListener('jobtrackr:datasync', handleSync)
  }, [])

  // Apply processing pipeline (dedup is manual-only to avoid false merges)
  const jobs = useMemo(() => autoStale(rawJobs), [rawJobs, settingsKey])

  // Persist to IndexedDB whenever jobs change
  useEffect(() => {
    if (!loading) {
      indexeddb.saveJobs(jobs).catch(err => console.error('Failed to save jobs:', err))
    }
  }, [jobs, loading])

  // Listen for settings changes to re-evaluate archives
  useEffect(() => {
    const handleSettingsChange = () => {
      setSettingsKey(k => k + 1)
    }
    window.addEventListener('jobtrackr-settings-changed', handleSettingsChange)
    return () => window.removeEventListener('jobtrackr-settings-changed', handleSettingsChange)
  }, [])

  // Mutations using syncManager for offline support
  const addJob = (data) => {
    const status = (data.status === 'rejected' && isAtsRejection(data.notes || '', data._fromEmail || ''))
      ? 'rejected_ats'
      : data.status

    let historyNote = data.notes || 'Offre ajoutée'
    if (status === 'todo') {
      historyNote = data.url
        ? `Offre trouvée — prête à postuler`
        : 'Offre ajoutée — à postuler'
    }

    let positionLinks = []
    if (data._emailBody) {
      const allUrls = extractUrlsFromEmail(data._emailBody)
      const ranked = rankUrlsByJobRelevance(allUrls)
      positionLinks = ranked.slice(0, 3)
    }

    const job = {
      ...data,
      status,
      id: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
      sentAt: ['sent','reviewing','waiting'].includes(status) ? (data.date || new Date().toISOString().split('T')[0]) : undefined,
      positionLinks: positionLinks || [],
      positionChecks: {},
      history: data._history || [{
        date: data.date,
        status,
        note: historyNote,
        offerUrl: status === 'todo' ? (data.url || '') : undefined,
        showCVButton: status === 'todo',
        gmailId: data._gmailId || undefined,
        from: data._fromEmail || undefined,
        fromMe: data._fromMe || false,
        source: data._gmailId ? 'email' : undefined,
      }]
    }
    delete job._gmailId
    delete job._fromEmail
    delete job._fromMe
    delete job._history
    delete job._emailBody

    setJobs(prev => [job, ...prev])
    syncManager.mutate('jobs', 'insert', job).catch(err => console.error('Failed to sync job:', err))
    return job
  }

  const updateJob = (id, data) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      const updated = { ...j, ...data, updated_at: new Date().toISOString() }
      return data.history ? sortJobHistory(updated) : updated
    }))
    const job = jobs.find(j => j.id === id)
    if (job) {
      const updated = { ...job, ...data, updated_at: new Date().toISOString() }
      const final = data.history ? sortJobHistory(updated) : updated
      syncManager.mutate('jobs', 'update', final).catch(err => console.error('Failed to sync job:', err))
    }
  }

  const deleteJob = (id) => {
    setJobs(prev => prev.filter(j => j.id !== id))
    syncManager.mutate('jobs', 'delete', { id }).catch(err => console.error('Failed to sync deletion:', err))
  }

  const updateStatus = (id, status) => {
    const st = STATUSES.find(s => s.key === status)
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      if (j.status === status) return j
      const updated = {
        ...j,
        status,
        updated_at: new Date().toISOString(),
        history: [...(j.history || []), {
          date: new Date().toISOString().split('T')[0],
          status,
          note: st ? `Statut mis à jour → ${st.label}` : 'Statut mis à jour',
        }]
      }
      return sortJobHistory(updated)
    }))
    const job = jobs.find(j => j.id === id)
    if (job) {
      const newJob = sortJobHistory({
        ...job,
        status,
        updated_at: new Date().toISOString(),
        history: [...(job.history || []), {
          date: new Date().toISOString().split('T')[0],
          status,
          note: st ? `Statut mis à jour → ${st.label}` : 'Statut mis à jour',
        }]
      })
      syncManager.mutate('jobs', 'update', newJob).catch(err => console.error('Failed to sync status:', err))
    }
  }

  const addHistoryEntry = (id, entry) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      const entryDate = new Date(entry.date)
      const isPast = entryDate < new Date()
      const resolvedStatus = entry.status === 'interview' && isPast ? 'done' : entry.status
      const updated = {
        ...j,
        status: resolvedStatus,
        updated_at: new Date().toISOString(),
        history: [...(j.history || []), { ...entry, status: resolvedStatus }]
      }
      return sortJobHistory(updated)
    }))
    const job = jobs.find(j => j.id === id)
    if (job) {
      const entryDate = new Date(entry.date)
      const isPast = entryDate < new Date()
      const resolvedStatus = entry.status === 'interview' && isPast ? 'done' : entry.status
      const newJob = sortJobHistory({
        ...job,
        status: resolvedStatus,
        updated_at: new Date().toISOString(),
        history: [...(job.history || []), { ...entry, status: resolvedStatus }]
      })
      syncManager.mutate('jobs', 'update', newJob).catch(err => console.error('Failed to sync history:', err))
    }
  }

  const markEnriched = (id) => {
    setJobs(prev => prev.map(j =>
      j.id === id ? { ...j, enrichedAt: new Date().toISOString() } : j
    ))
    const job = jobs.find(j => j.id === id)
    if (job) {
      const updated = { ...job, enrichedAt: new Date().toISOString() }
      syncManager.mutate('jobs', 'update', updated).catch(err => console.error('Failed to sync enrichment:', err))
    }
  }

  const clearEnriched = (id) => {
    setJobs(prev => prev.map(j =>
      j.id === id ? { ...j, enrichedAt: undefined } : j
    ))
    const job = jobs.find(j => j.id === id)
    if (job) {
      const updated = { ...job, enrichedAt: undefined }
      syncManager.mutate('jobs', 'update', updated).catch(err => console.error('Failed to sync enrichment clear:', err))
    }
  }

  const mergeDuplicates = () => {
    setJobs(prev => deduplicateJobs(prev))
  }

  const toggleFavorite = (id) => {
    // Find current favorite value BEFORE state update
    const currentJob = jobs.find(j => j.id === id)
    const newFavoriteValue = currentJob ? !currentJob.favorite : true

    // Update local state
    setJobs(prev => prev.map(j => j.id === id ? { ...j, favorite: newFavoriteValue } : j))

    // Sync with correct favorite value
    if (currentJob) {
      const updated = { ...currentJob, favorite: newFavoriteValue, updated_at: new Date().toISOString() }
      console.log('Toggling favorite:', id, 'new value:', updated.favorite)
      syncManager.mutate('jobs', 'update', updated).catch(err => console.error('Failed to sync favorite:', err))
    }
  }

  const clearAllJobs = () => setJobs([])

  const reprocessJobs = () => {
    setJobs(prev => {
      const revalidated = revalidateArchives(prev)
      const processed = autoStale(deduplicateJobs(mergeSameDateEntries(splitPipeNotes(deduplicateHistory(revalidated)))))

      return processed.map(job => {
        const hasHelloWorkResponse = (job.notes || '').includes('Réponse reçue de l\'entreprise via HelloWork') ||
                                     (job.notes || '').includes('Response received from company')
        const hasPositiveKeywords = /entretien|interview|call|visio|meeting|next steps|interested|pleased/i.test(job.notes || '')

        if (hasHelloWorkResponse && !hasPositiveKeywords && job.status === 'reviewing') {
          return { ...job, status: 'rejected' }
        }
        return job
      })
    })
  }

  const checkPosition = async (jobId, url) => {
    const result = await checkPositionUrl(url)
    setJobs(prev => prev.map(j => {
      if (j.id !== jobId) return j

      let updatedJob = {
        ...j,
        positionChecks: {
          ...(j.positionChecks || {}),
          [url]: result
        }
      }

      if (result.available === false && !['rejected', 'rejected_ats', 'cancelled', 'archived'].includes(j.status)) {
        updatedJob = {
          ...updatedJob,
          status: 'rejected',
          history: [
            ...(j.history || []),
            {
              date: new Date().toISOString().split('T')[0],
              status: 'rejected',
              note: `🔍 Poste fermé — détecté: ${result.reason || 'Position not available'}`,
            }
          ]
        }
      }

      return updatedJob
    }))

    const job = jobs.find(j => j.id === jobId)
    if (job) {
      let updatedJob = {
        ...job,
        positionChecks: {
          ...(job.positionChecks || {}),
          [url]: result
        }
      }

      if (result.available === false && !['rejected', 'rejected_ats', 'cancelled', 'archived'].includes(job.status)) {
        updatedJob = {
          ...updatedJob,
          status: 'rejected',
          history: [
            ...(job.history || []),
            {
              date: new Date().toISOString().split('T')[0],
              status: 'rejected',
              note: `🔍 Poste fermé — détecté: ${result.reason || 'Position not available'}`,
            }
          ]
        }
      }

      syncManager.mutate('jobs', 'update', updatedJob).catch(err => console.error('Failed to sync position check:', err))
    }
    return result
  }

  const checkAllPositions = async (jobId, topN = 1) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job || !job.positionLinks?.length) return []

    const urlsToCheck = job.positionLinks.slice(0, topN)
    const results = []
    for (const url of urlsToCheck) {
      const result = await checkPosition(jobId, url)
      results.push(result)
    }
    return results
  }

  const clearDeletedJobs = () => {
    // This is a no-op in Supabase version - deleted jobs are gone from server
  }

  return { jobs, addJob, updateJob, deleteJob, clearAllJobs, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite, markEnriched, clearEnriched, reprocessJobs, checkPosition, checkAllPositions, clearDeletedJobs, loading, findDuplicateInList: (co, pos) => findDuplicateJob(jobs, co, pos) }
}
