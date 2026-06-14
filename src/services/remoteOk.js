// RemoteOK API - Free remote job listings
// https://remoteok.io/api

export async function searchJobs({ query = '', location = 'france', page = 1, resultsPerPage = 20 }) {
  const params = new URLSearchParams({
    search: query,
    limit: resultsPerPage,
    offset: (parseInt(page) - 1) * resultsPerPage,
  })

  const res = await fetch(`/api/jobs?provider=remoteok&${params}`)
  if (!res.ok) throw new Error(`RemoteOK API error ${res.status}`)
  const data = await res.json()

  return {
    total: data.length || 0,
    jobs: (Array.isArray(data) ? data : []).map(j => ({
      id: j.id || j.slug,
      title: j.title,
      company: j.company || 'Entreprise inconnue',
      location: j.location || 'Remote',
      salary: formatSalary(j.salary),
      description: j.description || '',
      url: j.url || '',
      date: j.date?.split('T')[0] || '',
      category: j.job_type || '',
      contractType: 'permanent',
    }))
  }
}

function formatSalary(salary) {
  if (!salary) return null
  if (typeof salary === 'string') return salary
  if (salary.min && salary.max) {
    const minK = Math.round(salary.min / 1000)
    const maxK = Math.round(salary.max / 1000)
    return `${minK}k - ${maxK}k€`
  }
  return null
}
