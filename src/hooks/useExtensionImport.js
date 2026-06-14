import { useEffect } from 'react'

export function useExtensionImport(addJob, showToast, findDuplicate) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') !== '1') return
    const company = params.get('company') || ''
    const position = params.get('position') || ''
    if (!company || !position) return

    const jdKey = params.get('jdKey')
    const jdFromUrl = params.get('jd') || ''

    // If jdKey is present, request full JD from extension storage
    if (jdKey) {
      let responseReceived = false

      const handleJdResponse = (e) => {
        // Parse JSON string from extension (serialized to avoid cross-origin security errors)
        let data = {}
        try {
          data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail
        } catch (err) {
          return
        }
        if (data.jdKey === jdKey) {
          responseReceived = true
          window.removeEventListener('jobtrackr-jd-response', handleJdResponse)
          createJob(data.text || '')
        }
      }

      window.addEventListener('jobtrackr-jd-response', handleJdResponse)
      window.dispatchEvent(new CustomEvent('jobtrackr-jd-request', { detail: { jdKey } }))

      // Timeout fallback: if extension doesn't respond in 3 seconds, proceed without JD
      setTimeout(() => {
        if (!responseReceived) {
          window.removeEventListener('jobtrackr-jd-response', handleJdResponse)
          createJob('')
        }
      }, 3000)
    } else {
      // Use JD from URL param if no jdKey (backward compatibility)
      createJob(jdFromUrl)
    }

    function createJob(jobDescription) {
      // Skip if this posting is already tracked — the extension import path
      // bypasses the Add-modal's duplicate check, so without this the same
      // posting imported twice would create a doublon.
      if (findDuplicate) {
        const existing = findDuplicate(company, position)
        if (existing) {
          if (showToast) showToast(`ℹ️ ${company} est déjà dans JobTrackr`)
          window.history.replaceState({}, '', window.location.pathname)
          return
        }
      }

      const job = {
        company,
        position,
        url: params.get('url') || '',
        status: params.get('status') || 'todo',
        date: params.get('date') || new Date().toISOString().split('T')[0],
        notes: params.get('notes') || '',
        jobDescription: jobDescription, // store full JD for CV generator
      }

      addJob(job)
      if (showToast) showToast(`✅ ${company} importé depuis l'extension !`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, []) // eslint-disable-line
}
