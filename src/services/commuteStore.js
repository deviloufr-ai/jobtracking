// Commute company addresses, stored independently of the job sync lifecycle.
//
// Why separate: the Supabase sync uses a column whitelist (stripLocalOnlyFields),
// so `companyAddress` is never sent to the server. A remote-winning poll
// (pollManager.mergeJob) replaces the local job with the server row, which would
// drop an address stored on the job object. Keeping it in its own localStorage
// map, keyed by job id, makes it survive every poll/sync.

const KEY = 'jobtrackr_company_addresses'

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

export function getCompanyAddress(jobId) {
  if (!jobId) return ''
  return readAll()[jobId] || ''
}

export function setCompanyAddress(jobId, address) {
  if (!jobId) return
  const all = readAll()
  if (address && address.trim()) {
    all[jobId] = address.trim()
  } else {
    delete all[jobId]
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
    window.dispatchEvent(new CustomEvent('jobtrackr-company-address-changed', { detail: { jobId, address } }))
  } catch {}
}
