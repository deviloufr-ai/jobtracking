// France Travail API - Official French government job board
// Free public API with excellent French job coverage

export async function searchJobs({ query = '', location = 'france', page = 1, resultsPerPage = 20 }) {
  const params = new URLSearchParams({
    query,
    location,
    page,
    per_page: resultsPerPage,
  })

  const res = await fetch(`/api/wtj?${params}`)
  if (!res.ok) throw new Error(`France Travail API error ${res.status}`)
  const data = await res.json()

  return {
    total: data.resultats?.length || 0,
    jobs: (data.resultats || []).map(j => ({
      id: j.id,
      title: j.intitule,
      company: j.entreprise?.nom || 'Entreprise inconnue',
      location: j.lieuTravail?.libelle || '',
      salary: formatSalary(j.salaire),
      description: j.description || '',
      url: j.url || '',
      date: j.dateCreation?.split('T')[0] || '',
      category: j.secteurActivite?.libelle || '',
      contractType: j.typeContrat?.libelle || '',
    }))
  }
}

function formatSalary(salaire) {
  if (!salaire) return null
  const { libelle } = salaire
  if (!libelle) return null
  // France Travail returns salary ranges like "Entre 1500 et 2000 € par mois"
  return libelle.replace('par mois', '').replace('Par mois', '').trim()
}
