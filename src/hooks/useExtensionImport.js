import { useEffect } from 'react'

export function useExtensionImport(addJob, showToast) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') !== '1') return
    const company = params.get('company') || ''
    const position = params.get('position') || ''
    if (!company || !position) return

    const job = {
      company,
      position,
      url: params.get('url') || '',
      status: params.get('status') || 'todo',
      date: params.get('date') || new Date().toISOString().split('T')[0],
      notes: params.get('notes') || '',
      jobDescription: params.get('jd') || '', // store JD for CV generator
    }

    addJob(job)
    if (showToast) showToast(`✅ ${company} importé depuis l'extension !`)
    window.history.replaceState({}, '', window.location.pathname)
  }, []) // eslint-disable-line
}
