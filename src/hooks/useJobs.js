import { useState, useEffect } from 'react'

const STORAGE_KEY = 'jobtrackr_applications'

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

// Normalize company name for dedup comparison
function normalizeCompany(name = '') {
  return name.toLowerCase()
    .replace(/\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

// Status priority for merge (higher = more advanced)
const STATUS_PRIORITY = {
  cancelled: 0, sent: 1, reviewing: 2, waiting: 3,
  interview: 4, offer: 5, rejected: 6, rejected_ats: 6
}

// Merge duplicate jobs — keeps most advanced status, merges history
export function deduplicateJobs(jobs) {
  const groups = new Map()

  for (const job of jobs) {
    const key = normalizeCompany(job.company)
    if (!groups.has(key)) {
      groups.set(key, [job])
    } else {
      groups.get(key).push(job)
    }
  }

  const result = []
  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }

    // Sort by status priority desc, then date desc
    group.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 1
      const pb = STATUS_PRIORITY[b.status] ?? 1
      if (pb !== pa) return pb - pa
      return new Date(b.date) - new Date(a.date)
    })

    const primary = group[0]

    // Merge all histories
    const allHistory = group.flatMap(j => j.history || [])
    allHistory.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Deduplicate history entries
    const seenHistory = new Set()
    const mergedHistory = allHistory.filter(h => {
      const k = `${h.date}-${h.status}-${h.note}`
      if (seenHistory.has(k)) return false
      seenHistory.add(k)
      return true
    })

    // Merge notes
    const allNotes = [...new Set(group.map(j => j.notes).filter(Boolean))].join(' | ')

    result.push({
      ...primary,
      notes: allNotes || primary.notes,
      history: mergedHistory,
      _merged: group.length > 1 ? group.length : undefined
    })
  }

  return result
}

// Split pipe-separated notes into multiple history entries
function splitPipeNotes(jobs) {
  return jobs.map(j => {
    if (!j.history) return j
    const expanded = []
    for (const entry of j.history) {
      // Split on ' | ' separator
      if (entry.note && entry.note.includes(' | ')) {
        const parts = entry.note.split(' | ').filter(p => p.trim())
        parts.forEach(part => {
          expanded.push({ ...entry, note: part.trim() })
        })
      } else {
        expanded.push(entry)
      }
    }
    return { ...j, history: expanded }
  })
}

function autoStale(jobs) {
  const now = new Date()
  return jobs.map(j => {
    const lastUpdate = new Date(j.updatedAt || j.date)
    const daysSince = (now - lastUpdate) / (1000 * 60 * 60 * 24)

    // Auto-archive: no response after 2 months on active statuses
    if (['sent', 'reviewing', 'waiting'].includes(j.status) && daysSince >= 60) {
      const newEntry = {
        date: now.toISOString().split('T')[0],
        status: 'archived',
        note: `Archivée automatiquement — aucune réponse depuis ${Math.round(daysSince)} jours`
      }
      return { ...j, status: 'archived', updatedAt: now.toISOString(), history: [...(j.history || []), newEntry] }
    }

    // Auto-archive: rejected/cancelled older than 3 months
    if (['rejected', 'rejected_ats', 'cancelled'].includes(j.status) && daysSince >= 90) {
      const newEntry = {
        date: now.toISOString().split('T')[0],
        status: 'archived',
        note: 'Archivée automatiquement — candidature de plus de 3 mois'
      }
      return { ...j, status: 'archived', updatedAt: now.toISOString(), history: [...(j.history || []), newEntry] }
    }

    return j
  })
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const migrated = parsed.map(j => ({
        ...j,
        history: j.history || [{ date: j.date, status: j.status, note: 'Candidature ajoutée' }]
      }))
      const processed = autoStale(splitPipeNotes(migrated))
      return processed
    }
  } catch {}
  return INITIAL_DEMO
}

function save(jobs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
}

export function useJobs() {
  const [jobs, setJobs] = useState(load)

  useEffect(() => { save(jobs) }, [jobs])

  const addJob = (data) => {
    // Auto-detect ATS rejection
    const status = (data.status === 'rejected' && isAtsRejection(data.notes || '', data.fromEmail || ''))
      ? 'rejected_ats'
      : data.status

    // Build initial history entry
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
      history: [{
        date: data.date,
        status,
        note: historyNote,
        offerUrl: status === 'todo' ? (data.url || '') : undefined,
        showCVButton: status === 'todo',
      }]
    }
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
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      return {
        ...j,
        status,
        updatedAt: new Date().toISOString(),
        history: [...(j.history || []), {
          date: new Date().toISOString().split('T')[0],
          status,
          note: ''
        }]
      }
    }))
  }

  const addHistoryEntry = (id, entry) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j
      return {
        ...j,
        status: entry.status,
        updatedAt: new Date().toISOString(),
        history: [...(j.history || []), entry]
      }
    }))
  }

  // Merge all duplicate jobs in current list
  const mergeDuplicates = () => {
    setJobs(prev => {
      const merged = deduplicateJobs(prev)
      return merged
    })
  }

  const toggleFavorite = (id) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, favorite: !j.favorite } : j))
  }

  return { jobs, addJob, updateJob, deleteJob, updateStatus, addHistoryEntry, mergeDuplicates, toggleFavorite }
}
