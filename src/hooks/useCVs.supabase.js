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

    // Sync to Supabase
    syncManager.mutate('cvs', 'insert', entry).catch(err => console.error('Failed to sync CV:', err))

    return entry
  }

  const deleteCV = (id) => {
    setCVs(prev => prev.filter(c => c.id !== id))
    syncManager.mutate('cvs', 'delete', { id }).catch(err => console.error('Failed to sync CV deletion:', err))
  }

  const renameCV = (id, name) => {
    setCVs(prev => prev.map(c => c.id === id ? { ...c, name } : c))
    const cv = cvs.find(c => c.id === id)
    if (cv) {
      const updated = { ...cv, name }
      syncManager.mutate('cvs', 'update', updated).catch(err => console.error('Failed to sync CV rename:', err))
    }
  }

  return { cvs, addCV, deleteCV, renameCV, loading }
}
