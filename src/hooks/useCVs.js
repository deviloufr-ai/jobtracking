import { useState, useEffect, useRef } from 'react'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'
import { pushCV, deleteCVRemote } from '../services/cvSync'

// Tell sibling useCVs() instances (App's baseCV memo, Settings, useAutoScore, the
// generators…) to reload from IndexedDB after a LOCAL mutation. Each useCVs() call
// has its OWN useState, so without this a CV uploaded in Settings stayed invisible
// to the rest of the app until a full reload or the next remote poll ("upload a CV
// first" even though one was just added; background auto-scoring didn't start).
function notifyCvChange() {
  try { window.dispatchEvent(new CustomEvent('jobtrackr:cvsync')) } catch {}
}

export function useCVs() {
  const [cvs, setCVs] = useState([])
  const [loading, setLoading] = useState(true)
  // Distinguishes a change made by THIS instance ('local' → notify siblings) from
  // one applied by a reload ('remote' → don't re-dispatch, or instances would
  // notify each other in a loop).
  const changeSourceRef = useRef('init')

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
      changeSourceRef.current = 'remote'
      indexeddb.getAllCVs().then(c => setCVs(c || [])).catch(() => {})
    }
    // datasync = remote poll merged changes; cvsync = a sibling useCVs() mutated locally.
    window.addEventListener('jobtrackr:datasync', reload)
    window.addEventListener('jobtrackr:cvsync', reload)
    return () => {
      window.removeEventListener('jobtrackr:datasync', reload)
      window.removeEventListener('jobtrackr:cvsync', reload)
    }
  }, [])

  // Persist to IndexedDB whenever CVs change
  useEffect(() => {
    if (!loading) {
      Promise.all(cvs.map(cv => indexeddb.saveCV(cv)))
        .then(() => {
          // Only a change originating from THIS instance notifies siblings; a
          // reload-applied change must not re-dispatch (no feedback loop).
          if (changeSourceRef.current === 'local') notifyCvChange()
        })
        .catch(err => console.error('Failed to save CVs:', err))
        .finally(() => { changeSourceRef.current = 'idle' })
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
    changeSourceRef.current = 'local'
    setCVs(prev => [entry, ...prev])
    // Mirror to Supabase so the CV reaches the user's other devices
    pushCV(entry)
    return entry
  }

  const deleteCV = async (id) => {
    // Delete from IndexedDB first
    await indexeddb.deleteCV(id).catch(err => console.error('Failed to delete CV from IndexedDB:', err))
    // Then update state to trigger save effect
    changeSourceRef.current = 'local'
    setCVs(prev => prev.filter(c => c.id !== id))
    // Remove the remote copy too
    deleteCVRemote(id)
  }

  const renameCV = (id, name) => {
    changeSourceRef.current = 'local'
    setCVs(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name } : c)
      const merged = next.find(c => c.id === id)
      if (merged) pushCV(merged)
      return next
    })
  }

  const updateCV = (id, updates) => {
    changeSourceRef.current = 'local'
    setCVs(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c)
      const merged = next.find(c => c.id === id)
      if (merged) pushCV(merged)
      return next
    })
  }

  return { cvs, addCV, deleteCV, renameCV, updateCV, loading }
}
