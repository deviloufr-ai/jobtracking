// JSearch API - Free job search API
// https://rapidapi.com/laimoon-laimoon-v1/api/jsearch

export async function searchJobs({ query = '', location = 'france', page = 1, resultsPerPage = 20 }) {
  const params = new URLSearchParams({
    query,
    location,
    page,
    per_page: resultsPerPage,
  })

  const res = await fetch(`/api/jobs?provider=jsearch&${params}`)
  if (!res.ok) throw new Error(`JSearch API error ${res.status}`)
  const data = await res.json()

  return {
    total: data.data?.length || 0,
    jobs: (data.data || []).map(j => ({
      id: j.job_id,
      title: j.job_title,
      company: j.employer_name || 'Entreprise inconnue',
      location: formatLocation(j.job_city, j.job_state, j.job_country),
      salary: formatSalary(j.job_min_salary, j.job_max_salary),
      description: j.job_description || '',
      url: j.job_apply_link || '',
      date: j.job_posted_at?.split('T')[0] || '',
      category: j.job_employment_type || '',
      contractType: mapContractType(j.job_employment_type),
    }))
  }
}

function formatLocation(city, state, country) {
  const parts = [city, state, country].filter(Boolean)
  return parts.join(', ') || 'France'
}

function formatSalary(min, max) {
  if (!min && !max) return null
  if (min && max) {
    const minK = Math.round(min / 1000)
    const maxK = Math.round(max / 1000)
    return `${minK}k - ${maxK}k€`
  }
  if (min) return `dès ${Math.round(min / 1000)}k€`
  return null
}

function mapContractType(type) {
  if (!type) return null
  const typeMap = {
    'FULLTIME': 'permanent',
    'PARTTIME': 'part_time',
    'CONTRACT': 'contract',
    'TEMPORARY': 'temporary',
    'INTERNSHIP': 'internship',
  }
  return typeMap[type?.toUpperCase()] || type.toLowerCase()
}
