// Adzuna API - free tier, 250 req/day
// Register at: https://developer.adzuna.com/
const APP_ID = import.meta.env.VITE_ADZUNA_APP_ID || ''
const APP_KEY = import.meta.env.VITE_ADZUNA_APP_KEY || ''
const BASE_URL = 'https://api.adzuna.com/v1/api/jobs'

export function isAdzunaConfigured() {
  return !!APP_ID && !!APP_KEY
}

export async function searchJobs({ query = '', location = 'france', page = 1, resultsPerPage = 20, remote = false }) {
  if (!isAdzunaConfigured()) {
    // Return mock data in dev
    return getMockJobs(query)
  }

  const params = new URLSearchParams({
    query,
    location,
    page,
    results_per_page: resultsPerPage,
  })

  const res = await fetch(`/api/adzuna?${params}`)
  if (!res.ok) throw new Error(`Adzuna API error ${res.status}`)
  const data = await res.json()

  return {
    total: data.count || 0,
    jobs: (data.results || []).map(j => ({
      id: j.id,
      title: j.title,
      company: j.company?.display_name || 'Entreprise inconnue',
      location: j.location?.display_name || '',
      salary: j.salary_min && j.salary_max
        ? `${Math.round(j.salary_min/1000)}k - ${Math.round(j.salary_max/1000)}k€`
        : j.salary_min ? `dès ${Math.round(j.salary_min/1000)}k€` : null,
      description: j.description || '',
      url: j.redirect_url || '',
      date: j.created?.split('T')[0] || '',
      category: j.category?.label || '',
      contractType: j.contract_type || '',
    }))
  }
}

function getMockJobs(query) {
  return {
    total: 4,
    jobs: [
      { id: '1', title: 'Senior Product Manager', company: 'Pennylane', location: 'Paris (Remote)', salary: '65k - 85k€', description: 'Rejoignez notre équipe produit pour piloter la roadmap de notre solution comptable SaaS B2B.', url: 'https://welcometothejungle.com', date: new Date().toISOString().split('T')[0], category: 'IT Jobs', contractType: 'permanent' },
      { id: '2', title: 'Product Owner B2B SaaS', company: 'Qonto', location: 'Paris', salary: '60k - 75k€', description: 'Vous définirez et prioriserez le backlog produit de notre plateforme bancaire.', url: 'https://welcometothejungle.com', date: new Date().toISOString().split('T')[0], category: 'IT Jobs', contractType: 'permanent' },
      { id: '3', title: 'Lead Product Manager - Remote', company: 'Doctolib', location: 'France (Full Remote)', salary: '80k - 100k€', description: 'Leadez une squad de 8 personnes sur notre produit de prise de RDV médical.', url: 'https://welcometothejungle.com', date: new Date().toISOString().split('T')[0], category: 'IT Jobs', contractType: 'permanent' },
      { id: '4', title: 'Product Manager IoT', company: 'Withings', location: 'Issy-les-Moulineaux', salary: '55k - 70k€', description: 'Pilotez le développement de nos objets connectés santé grand public.', url: 'https://welcometothejungle.com', date: new Date().toISOString().split('T')[0], category: 'IT Jobs', contractType: 'permanent' },
    ]
  }
}
