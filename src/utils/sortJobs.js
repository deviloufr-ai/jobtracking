export const DEFAULT_SORT = 'date_desc'

export function sortJobs(jobs, sort = DEFAULT_SORT) {
  const sorted = [...jobs]
  switch (sort) {
    case 'date_asc':     return sorted.sort((a, b) => new Date(a.date) - new Date(b.date))
    case 'date_desc':    return sorted.sort((a, b) => new Date(b.date) - new Date(a.date))
    case 'company_asc':  return sorted.sort((a, b) => a.company.localeCompare(b.company))
    case 'company_desc': return sorted.sort((a, b) => b.company.localeCompare(a.company))
    case 'status':       return sorted.sort((a, b) => a.status.localeCompare(b.status))
    default:             return sorted
  }
}
