import { useState, useEffect } from 'react'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'
import { pushCV, deleteCVRemote } from '../services/cvSync'

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

  // Re-read CVs from IndexedDB after a poll merges remote changes (multi-device
  // sync), so CVs uploaded on another device appear without a page reload.
  useEffect(() => {
    const reload = () => {
      indexeddb.getAllCVs().then(c => setCVs(c || [])).catch(() => {})
    }
    window.addEventListener('jobtrackr:datasync', reload)
    return () => window.removeEventListener('jobtrackr:datasync', reload)
  }, [])

  // Persist to IndexedDB whenever CVs change
  useEffect(() => {
    if (!loading) {
      Promise.all(cvs.map(cv => indexeddb.saveCV(cv))).catch(err => console.error('Failed to save CVs:', err))
      // Mirror the most-recent CV into localStorage so the Firefox extension's
      // sync.js (which can only read localStorage synchronously) can pick it up.
      // CVs themselves live in IndexedDB; this is a lightweight read-only copy.
      try {
        if (cvs.length > 0) {
          const base = [...cvs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
          localStorage.setItem('jobtrackr_base_cv', JSON.stringify({
            name: base.name || null,
            text: base.text || '',
            createdAt: base.createdAt || null,
          }))
        } else {
          localStorage.removeItem('jobtrackr_base_cv')
        }
      } catch (e) {
        // localStorage quota or serialization issue — non-critical
      }
    }
  }, [cvs, loading])

  const addCV = (cv) => {
    const entry = { ...cv, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setCVs(prev => [entry, ...prev])
    // Mirror to Supabase so the CV reaches the user's other devices
    pushCV(entry)
    return entry
  }

  const deleteCV = async (id) => {
    // Delete from IndexedDB first
    await indexeddb.deleteCV(id).catch(err => console.error('Failed to delete CV from IndexedDB:', err))
    // Then update state to trigger save effect
    setCVs(prev => prev.filter(c => c.id !== id))
    // Remove the remote copy too
    deleteCVRemote(id)
  }

  const renameCV = (id, name) => {
    setCVs(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name } : c)
      const merged = next.find(c => c.id === id)
      if (merged) pushCV(merged)
      return next
    })
  }

  const updateCV = (id, updates) => {
    setCVs(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c)
      const merged = next.find(c => c.id === id)
      if (merged) pushCV(merged)
      return next
    })
  }

  return { cvs, addCV, deleteCV, renameCV, updateCV, loading }
}
