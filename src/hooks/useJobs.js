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
  },
]

export const STATUSES = [
  { key: 'sent',      label: 'Envoyée',             color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  { key: 'reviewing', label: 'En cours d\'examen',   color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  { key: 'interview', label: 'Entretien planifié',   color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'waiting',   label: 'En attente',           color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { key: 'offer',     label: 'Offre reçue',          color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  { key: 'rejected',  label: 'Refusée',              color: 'bg-red-100 text-red-700',      dot: 'bg-red-400' },
  { key: 'cancelled', label: 'Annulée',              color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
]

export function getStatus(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0]
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
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
    const job = { ...data, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }
    setJobs(prev => [job, ...prev])
    return job
  }

  const updateJob = (id, data) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...data, updatedAt: new Date().toISOString() } : j))
  }

  const deleteJob = (id) => {
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  const updateStatus = (id, status) => {
    updateJob(id, { status })
  }

  return { jobs, addJob, updateJob, deleteJob, updateStatus }
}
