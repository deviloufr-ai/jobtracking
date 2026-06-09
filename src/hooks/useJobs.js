import { useState, useEffect, useMemo } from 'react'
import { loadSettings } from './useSettings'

const STORAGE_KEY = 'jobtrackr_applications'

// ─── enrichedAt helpers ───────────────────────────────────────────────────────
// Max age before enrichment is considered stale (30 days)
const ENRICH_TTL_DAYS = 30

export function isEnriched(job) {
  if (!job?.enrichedAt) return false
  const age = (Date.now() - new Date(job.enrichedAt).getTime()) / (1000 * 60 * 60 * 24)
  return age < ENRICH_TTL_DAYS
}

export function needsEnrichment(job) {
  return !isEnriched(job)
}
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_DEMO = [
  {
    id: '1',
    company: 'Pennylane',
    position: 'Senior Product Manager',
    url: 'https://www.pennylane.com/fr/careers',
    status: 'interview',
    date: '2026-05-20',
    notes: 'Entretien RH passé, en attente retour technique',
    updatedAt: new Date().toISOString(),
    history: [
      { date: '2026-05-20', status: 'sent', note: 'Candidature envoyée via LinkedIn' },
      { date: '2026-05-22', status: 'reviewing', note: 'Profil consulté par le recruteur' },
      { date: '2026-05-25', status: 'interview', note: 'Entretien RH - 45min avec Sophie M.' },
    ]
  },
  {
    id: '2',
    company: 'Padam Mobility',
    position: 'Product Owner – Mobilité',
    url: '',
    status: 'sent',
    date: '2026-05-28',
    notes: '',
    updatedAt: new Date().toISOString(),
    history: [{ date: '2026-05-28', status: 'sent', note: 'Candidature envoyée' }]
  },
  {
    id: '3',
    company: 'Luni',
    position: 'Lead Product Manager',
    url: '',
    status: 'waiting',
    date: '2026-05-15',
    notes: 'Très bon feeling, profil rare demandé',
    updatedAt: new Date().toISOString(),
    history: [
      { date: '2026-05-15', status: 'sent', note: 'Candidature envoyée' },
      { date: '2026-05-18', status: 'interview', note: 'Entretien technique - 1h avec le CTO' },
      { date: '2026-05-22', status: 'waiting', note: 'En attente de décision finale' },
    ]
  },
]

// ATS platforms that send automated rejection emails
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
    // Strip trailing legal suffixes (word boundary required — avoids stripping mid-name)
    .replace(/\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?\s*$/i, '')
    // Strip trailing TLD suffixes (.io .com .fr etc.) only when at end
    .replace(/\.(io|com|fr|co|net|org|app|ai|eu|de|uk|be|ch|ca|us|tech|dev)\s*$/i, '')
    // Strip truly generic STANDALONE suffixes only — NOT 'ai' or 'app' (part of many brand names)
    .replace(/\b(technologies|digital|solutions|group|labs|studio|hq|services|consulting|innovation|ventures|project|projects)\b/gi, '')
    // Strip everything non-alphanumeric
    .replace(/[^a-z0-9]/g, '')
}

const STATUS_PRIORITY = {
  cancelled: 0, sent: 1, reviewing: 2, waiting: 3,
  interview: 4, done: 4, offer: 5, rejected: 6, rejected_ats: 6
}

export function deduplicateJobs(jobs) {
  const GENERIC_POS_SET = new Set(['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', ''])
  // Normalize position: lowercase, trim, and remove gender markers (H/F, M/F, F/H, etc.)
  const normPos = p => (p || '').toLowerCase().trim().replace(/\s*[hf]\/[hf]\s*/gi, '').trim()
  const isGenericPos = p => GENERIC_POS_SET.has(normPos(p))

  // Group by company + normalized position so different roles at the same company
  // are never merged. Generic/unknown positions fall back to company-only key so they
  // can still be deduped against a real position from the same import.
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

  // Second pass: merge generic-position entries with real-position entries at same company
  // (e.g., "OpenSourcing/Poste non précisé" merges with "OpenSourcing/Responsible Projects")
  const realGroups = new Map()
  const genericByCompany = new Map()
  for (const [key, group] of groups) {
    if (key.includes('|||')) {
      realGroups.set(key, group)
    } else {
      // This is a company-only key (generic position)
      const existing = genericByCompany.get(key)
      genericByCompany.set(key, existing ? [...existing, ...group] : group)
    }
  }

  // Merge generic entries into their corresponding real-position groups
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
      // No real position entry found, keep the generic one
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

    // Guard: if multiple distinct real positions slipped into the same bucket
    // (e.g. two generic-position jobs that resolved differently), keep them separate.
    const realPositions = [...new Set(group.map(j => normPos(j.position)).filter(p => !GENERIC_POS_SET.has(p)))]
    if (realPositions.length > 1) {
      group.forEach(j => result.push(j))
      continue
    }

    // Don't merge re-applications: same role, terminal status, then new application > 60 days later
    const TERMINAL = ['rejected', 'rejected_ats', 'cancelled']
    const hasTerminal = group.some(j => TERMINAL.includes(j.status))
    if (group.length > 1) {
      const dates = group.map(j => new Date(j.date).getTime())
      const span = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)
      // Fix #9 — also split non-terminal groups with large date gaps (re-application for same title)
      const threshold = hasTerminal ? 60 : 90
      if (span > threshold) {
        group.forEach(j => result.push(j))
        continue
      }
    }

    const primary = group[0]

    // Prefer the most descriptive position across the group — "Unknown" / generic loses to a real title
    const GENERIC_POSITIONS = ['unknown', 'unknown position', 'poste non précisé', 'non spécifié', 'inconnu', '']
    const bestPosition = group
      .map(j => j.position || '')
      .find(p => !GENERIC_POSITIONS.includes(p.toLowerCase().trim()))
      || primary.position

    const allHistory = group.flatMap(j => j.history || [])
    allHistory.sort((a, b) => new Date(a.date) - new Date(b.date))

    const seenHistory = new Set()
    const mergedHistory = allHistory.filter(h => {
      // Normalize note for dedup — same as deduplicateHistory
      const normNote = (h.note || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
      const k = `${h.date}_${normNote}`
      if (seenHistory.has(k)) return false
      seenHistory.add(k)
      return true
    })

    const allNotes = [...new Set(group.map(j => j.notes).filter(Boolean))].join(' | ')

    // Keep enrichedAt from the most recently enriched job in the group
    const latestEnrichedAt = group
      .map(j => j.enrichedAt)
      .filter(Boolean)
      .sort()
      .pop()

    // Preserve all non-empty fields from all merged jobs to avoid data loss
    const merged = { ...primary }
    for (const job of group.slice(1)) {
      for (const [key, value] of Object.entries(job)) {
        // Skip system/metadata fields and ones we'll set explicitly below
        if (['id', 'position', 'notes', 'history', 'enrichedAt', 'updatedAt'].includes(key)) continue
        // Preserve non-empty values that don't exist in primary
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
      // Only split on ' | ' when ALL resulting parts are meaningful notes (≥10 chars)
      // Avoids splitting legitimate content like "CDI | Remote" or "Paris | Full-remote"
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

function mergeSameDateEntries(jobs) {
  return jobs.map(j => {
    if (!j.history || j.history.length <= 1) return j

    // Separate meetings from other entries
    const isMeetingEntry = (entry) => entry.source === 'calendar' || !!entry.meetingLink ||
                                       (entry.note && entry.note.startsWith('📅'))

    const meetings = []
    const byDate = {}
    const order = []

    for (const entry of j.history) {
      if (isMeetingEntry(entry)) {
        // Keep meetings as-is, no merging
        meetings.push(entry)
      } else {
        // Merge only non-meeting entries by date
        const key = entry.date || 'unknown'
        if (!byDate[key]) {
          byDate[key] = { ...entry, _notes: entry.note ? [entry.note] : [], _gmailIds: entry.gmailId ? [entry.gmailId] : [] }
          order.push(key)
        } else {
          const existing = byDate[key]
          const statusOrder = ['todo','sent','reviewing','interview','done','waiting','offer','rejected','rejected_ats','cancelled','archived']
          const existingIdx = statusOrder.indexOf(existing.status)
          const entryIdx = statusOrder.indexOf(entry.status)
          if (entryIdx > existingIdx) existing.status = entry.status
          if (entry.note && entry.note.trim()) {
            const normNew = entry.note.trim().toLowerCase().replace(/\s+/g, ' ')
            const isDup = existing._notes.some(n => n.trim().toLowerCase().replace(/\s+/g, ' ') === normNew)
            if (!isDup) existing._notes.push(entry.note.trim())
          }
          if (entry.gmailId && !existing._gmailIds.includes(entry.gmailId)) {
            existing._gmailIds.push(entry.gmailId)
          }
          if (!existing.meetingLink && entry.meetingLink) existing.meetingLink = entry.meetingLink
        }
      }
    }

    const merged = order.map(key => {
      const e = byDate[key]
      const gmailIds = e._gmailIds.filter(Boolean)
      return {
        ...e,
        note: e._notes.join(' · '),
        gmailId: gmailIds[0] || undefined,
        // Fix #10 — preserve extra gmailIds so multiple "Voir l'email" links can be shown
        gmailIds: gmailIds.length > 1 ? gmailIds : undefined,
        _notes: undefined,
        _gmailIds: undefined,
      }
    })

    // Merge meetings and non-meetings back together in original order
    const combined = []
    for (const entry of j.history) {
      if (isMeetingEntry(entry)) {
        combined.push(entry)
      } else {
        // Find the merged version of this non-meeting entry
        const mergedEntry = merged.find(m => m.date === entry.date)
        if (mergedEntry && !combined.some(c => c === mergedEntry)) {
          combined.push(mergedEntry)
        }
      }
    }
    return { ...j, history: combined }
  })
}

function autoStale(jobs) {
  const now = new Date()
  const { archiveSentDays, archiveRejectedDays } = loadSettings()
  return jobs.map(j => {
    if (j.status === 'archived') return j

    // Use the ORIGINAL job date as reference for archival
    // Don't use latest history entry date (it gets updated on every re-import)
    // Use j.date (when the application was first recorded) for accurate stale calculation
    const refDate = new Date(j.date || j.updatedAt)
    const daysSince = (now - refDate) / (1000 * 60 * 60 * 24)

    const threshold = ['rejected', 'rejected_ats', 'cancelled'].includes(j.status) ? archiveRejectedDays : archiveSentDays
    if (daysSince >= threshold) {
      const newEntry = {
        date: now.toISOString().split('T')[0],
        status: 'archived',
        note: `Archivée automatiquement — aucune mise à jour depuis ${Math.round(daysSince)} jours`
      }
      return { ...j, status: 'archived', updatedAt: now.toISOString(), history: [...(j.history || []), newEntry] }
    }

    return j
  })
}

// Deduplicate · -separated fragments within a single note string
function deduplicateNoteFragments(note = '') {
  if (!note.includes(' · ')) return note
  const seen = new Set()
  const parts = note.split(' · ').filter(Boolean).filter(p => {
    const norm = p.trim().toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(norm)) return false
    seen.add(norm)
    return true
  })
  return parts.join(' · ')
}

function deduplicateHistory(jobs) {
  return jobs.map(j => {
    if (!j.history || j.history.length <= 1) return j
    const seen = new Set()
    const deduped = j.history.filter(h => {
      // Normalize: lowercase + collapse whitespace so minor variations don't slip through
      const normNote = (h.note || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
      const key = `${h.date}_${normNote}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Collapse multiple "sent" entries into the earliest one — a job is applied to once
    // per cycle. Multiple sent entries are always job board notification noise (LinkedIn,
    // Jobgether, etc. sending repeated "application sent/viewed" emails on different dates).
    const sentEntries = deduped.filter(h => h.status === 'sent').sort((a, b) => new Date(a.date) - new Date(b.date))
    if (sentEntries.length > 1) {
      const [keepSent, ...extraSent] = sentEntries
      const extraSentSet = new Set(extraSent.map(h => h))
      const collapsed = deduped.filter(h => !extraSentSet.has(h))
      // Absorb any unique info from discarded entries into the kept one's note
      const extraNotes = extraSent
        .map(h => (h.note || '').trim())
        .filter(n => n && n.toLowerCase() !== (keepSent.note || '').toLowerCase())
        .filter((n, i, arr) => arr.indexOf(n) === i)
      if (extraNotes.length) {
        const idx = collapsed.indexOf(keepSent)
        collapsed[idx] = { ...keepSent, note: [keepSent.note, ...extraNotes].filter(Boolean).join(' · ') }
      }
      return { ...j, history: collapsed }
    }

    return deduped.length === j.history.length ? j : { ...j, history: deduped }
  })
}

const SUGGESTION_NOTE_KEYWORDS = [
  'recommandée', 'offre recommandée', 'pas de candidature confirmée',
  'candidature suggérée', 'suggested job', 'job suggestion',
  'alerte indeed', 'alerte emploi', 'job alert', 'offre correspondante',
]
// Fix #14 — positive signals override suggestion filter so real candidatures are never dropped
const APPLICATION_SIGNALS = [
  'candidature', 'applied', 'postulé', 'entretien', 'interview',
  'envoyé', 'sent', 'reçu', 'confirmé', 'relance', 'offre reçue',
]
function isSuggestionJob(j) {
  const notes = (j.history || []).map(h => (h.note || '').toLowerCase())
  if (notes.length === 0) return false
  // If ANY note contains a real application signal, keep the job regardless
  if (notes.some(n => APPLICATION_SIGNALS.some(k => n.includes(k)))) return false
  return notes.every(n => SUGGESTION_NOTE_KEYWORDS.some(k => n.includes(k)))
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const migrated = parsed
        .filter(j => !isSuggestionJob(j))
        .map(j => ({
          ...j,
          // Clean duplicate · fragments within notes before any other processing
          history: (j.history || [{ date: j.date, status: j.status, note: 'Candidature ajoutée' }])
            .map(h => ({ ...h, note: deduplicateNoteFragments(h.note) }))
        }))

      // Migration: Set lastSyncTime on jobs that don't have it
      // This enables incremental sync on next refresh
      // If any job is missing lastSyncTime, set all to now-1h (catches recent emails without re-fetching 3mo)
      const hasAnyLastSyncTime = migrated.some(j => j.lastSyncTime)
      if (!hasAnyLastSyncTime) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        migrated.forEach(j => {
          if (!j.lastSyncTime) j.lastSyncTime = oneHourAgo
        })
      }

      // Fix #5 — autoStale removed from load(); it runs in useMemo on every render instead,
      // avoiding double-archival and stale-threshold drift on initial load.
      const processed = deduplicateJobs(mergeSameDateEntries(splitPipeNotes(deduplicateHistory(migrated))))
      return processed
    }
  } catch (e) { console.error('JobTrackr: failed to load saved data', e) }
  return []
}

function save(jobs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
}

export function useJobs() {
  const [rawJobs, setJobs] = useState(load)
  const [settingsKey, setSettingsKey] = useState(0) // Force re-evaluation when settings change

  // Apply autoStale on every render so threshold changes from Settings take effect immediately
  const jobs = useMemo(() => autoStale(rawJobs), [rawJobs, settingsKey])

  useEffect(() => { save(jobs) }, [jobs])  // save derived (post-autoStale) so archived status persists

  // Listen for localStorage changes (from other tabs/windows or background processes)
  // Also listen for settings changes to re-evaluate archive thresholds
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        setJobs(load())
      }
      if (e.key === 'jobtrackr_settings' || e.key === null) {
        setSettingsKey(k => k + 1)
      }
    }
    window.addEventListener('storage', handleStorageChange)

    // Also listen for changes on the same tab via beforeunload (settings saved in same tab)
    const checkSettingsChange = () => {
      setSettingsKey(k => k + 1)
    }

    // Create a custom event to notify settings changes in the same tab
    window.addEventListener('jobtrackr-settings-changed', checkSettingsChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('jobtrackr-settings-changed', checkSettingsChange)
    }
  }, [])

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

    const job = {
      ...data,
      status,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      sentAt: ['sent','reviewing','waiting'].includes(status) ? (data.date || new Date().toISOString().split('T')[0]) : undefined,
      // enrichedAt intentionally absent on creation — will be set after first enrichment
      // Use pre-built history from email import when available (preserves per-email dates)
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
    setJobs(prev => [job, ...prev])
    return job
  }

  const updateJob = (id, data) => {
    setJobs(prev => prev.map(j => j.id === id
      ? { ...j, ...data, updatedAt: new Date().toISOString() }
      : j
    ))
  }

  const deleteJob = (id) => {
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const updateStatus = (id, status) => {
    // Fix #4 — add a non-empty note so history doesn't accumulate blank entries
    const st = STATUSES.find(s => s.key === status)
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      // Skip if status didn't actually change
      if (j.status === status) return j
      return {
        ...j,
        status,
        updatedAt: new Date().toISOString(),
        history: [...(j.history || []), {
          date: new Date().toISOString().split('T')[0],
          status,
          note: st ? `Statut mis à jour → ${st.label}` : 'Statut mis à jour',
        }]
      }
    }))
  }

  const addHistoryEntry = (id, entry) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      // Auto-set status to 'done' when adding a past interview/meeting entry
      const entryDate = new Date(entry.date)
      const isPast = entryDate < new Date()
      const resolvedStatus = entry.status === 'interview' && isPast ? 'done' : entry.status
      return {
        ...j,
        status: resolvedStatus,
        updatedAt: new Date().toISOString(),
        history: [...(j.history || []), { ...entry, status: resolvedStatus }]
      }
    }))
  }

  // Mark a job as enriched — call this after any successful Claude enrichment
  const markEnriched = (id) => {
    setJobs(prev => prev.map(j =>
      j.id === id ? { ...j, enrichedAt: new Date().toISOString() } : j
    ))
  }

  // Force re-enrichment on next open (clears the flag)
  const clearEnriched = (id) => {
    setJobs(prev => prev.map(j =>
      j.id === id ? { ...j, enrichedAt: undefined } : j
    ))
  }

  const mergeDuplicates = () => {
    setJobs(prev => deduplicateJobs(prev))
  }

  const toggleFavorite = (id) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, favorite: !j.favorite } : j))
  }

  // Fix #3 — single setJobs([]) instead of N deleteJob calls
  const clearAllJobs = () => setJobs([])

  // Re-run the full processing pipeline on current state (dedup, merge, autoStale)
  // Call this after bulk imports/refreshes to clean up duplicates without a page reload
  const reprocessJobs = () => {
    setJobs(prev => {
      const processed = autoStale(deduplicateJobs(mergeSameDateEntries(splitPipeNotes(deduplicateHistory(prev)))))

      // FIX: Post-process HelloWork rejections that Claude mis-parses as reviewing
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

  return { jobs, addJob, updateJob, deleteJob, clearAllJobs, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite, markEnriched, clearEnriched, reprocessJobs }
}
