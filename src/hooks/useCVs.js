import { useState, useEffect } from 'react'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'

export function useCVs() {
  const [cvs, setCVs] = useState([])
  const [loading, setLoading] = useState(true)

  // Load from IndexedDB on mount
  useEffect(() => {
    const loadCVs = async () => {
      try {
        await indexeddb.init()
        const cached = await indexeddb.getAllCVs()
        setCVs(cached || [])
      } catch (err) {
        console.error('Failed to load CVs from IndexedDB:', err)
        setCVs([])
      } finally {
        setLoading(false)
      }
    }
    loadCVs()
  }, [])

  // Persist to IndexedDB whenever CVs change
  useEffect(() => {
    if (!loading) {
      Promise.all(cvs.map(cv => indexeddb.saveCV(cv))).catch(err => console.error('Failed to save CVs:', err))
    }
  }, [cvs, loading])

  const addCV = (cv) => {
    const entry = { ...cv, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setCVs(prev => [entry, ...prev])
    // CVs are stored locally only, no Supabase sync needed yet
    return entry
  }

  const deleteCV = (id) => {
    setCVs(prev => prev.filter(c => c.id !== id))
    indexeddb.deleteCV(id).catch(err => console.error('Failed to delete CV from IndexedDB:', err))
  }

  const renameCV = (id, name) => {
    setCVs(prev => prev.map(c => c.id === id ? { ...c, name } : c))
    // CVs are stored locally only
  }

  const updateCV = (id, updates) => {
    setCVs(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    // CVs are stored locally only
  }

  return { cvs, addCV, deleteCV, renameCV, updateCV, loading }
}
