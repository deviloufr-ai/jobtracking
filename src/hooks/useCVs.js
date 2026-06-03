import { useState, useEffect } from 'react'

const STORAGE_KEY = 'jobtrackr_cvs'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function useCVs() {
  const [cvs, setCVs] = useState(load)
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(cvs)) }, [cvs])

  const addCV = (cv) => {
    const entry = { ...cv, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setCVs(prev => [entry, ...prev])
    return entry
  }

  const deleteCV = (id) => setCVs(prev => prev.filter(c => c.id !== id))
  const renameCV = (id, name) => setCVs(prev => prev.map(c => c.id === id ? { ...c, name } : c))

  return { cvs, addCV, deleteCV, renameCV }
}
