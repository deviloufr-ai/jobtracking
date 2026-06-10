import { useEffect } from 'react'

export function useExtensionImport(addJob, showToast) {
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
      const handleJdResponse = (e) => {
        if (e.detail?.jdKey === jdKey) {
          window.removeEventListener('jobtrackr-jd-response', handleJdResponse)
          createJob(e.detail?.text || '')
        }
      }

      window.addEventListener('jobtrackr-jd-response', handleJdResponse)
      window.dispatchEvent(new CustomEvent('jobtrackr-jd-request', { detail: { jdKey } }))

      // Timeout fallback: if extension doesn't respond in 2 seconds, proceed with empty JD
      setTimeout(() => {
        window.removeEventListener('jobtrackr-jd-response', handleJdResponse)
        createJob('')
      }, 2000)
    } else {
      // Use JD from URL param if no jdKey
      createJob(jdFromUrl)
    }

    function createJob(jobDescription) {
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
