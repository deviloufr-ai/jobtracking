import { useEffect } from 'react'

export function useExtensionImport(addJob, showToast, findDuplicate) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // ── Batch import from the extension's listing scan (?addBatch=1&batchKey=…) ──
    // The extension stored the selected offers in its own storage under batchKey;
    // it hands them over via the jobtrackr-batch-request/response event bridge
    // (same mechanism as the single-job jdKey bridge below).
    if (params.get('addBatch') === '1') {
      handleBatchImport(params.get('batchKey'))
      return
    }

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

    function handleBatchImport(batchKey) {
      if (!batchKey) return
      let responseReceived = false

      const handleBatchResponse = (e) => {
        let data = {}
        try {
          data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail
        } catch (err) {
          return
        }
        if (data.batchKey !== batchKey) return
        responseReceived = true
        window.removeEventListener('jobtrackr-batch-response', handleBatchResponse)
        importBatch(Array.isArray(data.jobs) ? data.jobs : [])
      }

      window.addEventListener('jobtrackr-batch-response', handleBatchResponse)
      window.dispatchEvent(new CustomEvent('jobtrackr-batch-request', { detail: { batchKey } }))

      // Timeout fallback: if the extension doesn't answer, just clear the URL.
      setTimeout(() => {
        if (!responseReceived) {
          window.removeEventListener('jobtrackr-batch-response', handleBatchResponse)
          window.history.replaceState({}, '', window.location.pathname)
        }
      }, 4000)

      function importBatch(jobs) {
        let added = 0
        let skipped = 0
        for (const j of jobs) {
          const c = (j.company || '').trim()
          const pos = (j.position || j.title || '').trim()
          if (!c && !pos) continue
          if (findDuplicate && findDuplicate(c, pos)) { skipped++; continue }
          addJob({
            company: c,
            position: pos,
            url: j.url || '',
            status: j.status || 'todo',
            date: j.date || new Date().toISOString(),
            notes: '',
            jobDescription: j.description || j.snippet || '',
          })
          added++
        }
        if (showToast) {
          if (added) {
            const dup = skipped ? ` · ${skipped} doublon${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''}` : ''
            showToast(`✅ ${added} offre${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} depuis l'extension${dup}`)
          } else if (skipped) {
            showToast(`ℹ️ ${skipped} offre${skipped > 1 ? 's' : ''} déjà dans JobTrackr`)
          }
        }
        window.history.replaceState({}, '', window.location.pathname)
      }
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
        // Keep the full ISO timestamp (with time) so a fresh import sorts to the
        // top among same-day rows. The "date" sort keys off the latest history
        // timestamp; a date-only value (midnight) would lose the tiebreak to any
        // Gmail entry imported earlier today that carries a real time-of-day.
        date: params.get('date') || new Date().toISOString(),
        notes: params.get('notes') || '',
        jobDescription: jobDescription, // store full JD for CV generator
      }

      addJob(job)
      if (showToast) showToast(`✅ ${company} importé depuis l'extension !`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, []) // eslint-disable-line
}
