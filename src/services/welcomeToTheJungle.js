// Welcome to the Jungle API - French tech-focused job board
// https://developers.welcometothejungle.com/

export async function searchJobs({ query = '', location = 'france', page = 1, resultsPerPage = 20 }) {
  const params = new URLSearchParams({
    provider: 'wttj',
    query,
    location,
    page,
    per_page: resultsPerPage,
  })

  const res = await fetch(`/api/jobs?${params}`)
  if (!res.ok) throw new Error(`WTTJ API error ${res.status}`)
  const data = await res.json()

  return {
    total: data.meta?.total || 0,
    jobs: (data.jobs || []).map(j => ({
      id: j.id,
      title: j.name,
      company: j.company?.name || 'Entreprise inconnue',
      location: j.location?.name || '',
      salary: formatSalary(j.salary_min, j.salary_max),
      description: j.description || '',
      url: j.url || '',
      date: j.published_at?.split('T')[0] || '',
      category: j.job_category?.name || '',
      contractType: mapContractType(j.contract_type?.name),
    }))
  }
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

function mapContractType(name) {
  if (!name) return null
  const typeMap = {
    'CDI': 'permanent',
    'CDD': 'contract',
    'Freelance': 'freelance',
    'Stage': 'internship',
    'Alternance': 'apprenticeship',
  }
  return typeMap[name] || name.toLowerCase()
}
