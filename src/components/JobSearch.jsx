import { useState, useCallback } from 'react'
import { searchJobs, isAdzunaConfigured } from '../services/adzuna'

const CONTRACT_LABELS = {
  permanent: 'CDI',
  contract: 'CDD',
  part_time: 'Temps partiel',
  temporary: 'Intérim',
}

export default function JobSearch({ onAddJob, existingJobs }) {
  const [query, setQuery] = useState('Product Manager')
  const [location, setLocation] = useState('france')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [added, setAdded] = useState(new Set())

  const handleSearch = useCallback(async (p = 1) => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setPage(p)
    try {
      const data = await searchJobs({ query, location, page: p })
      setResults(data)
    } catch (e) {
      setError('Erreur lors de la recherche : ' + e.message)
    }
    setLoading(false)
  }, [query, location])

  const handleAdd = (job) => {
    onAddJob({
      company: job.company,
      position: job.title,
      url: job.url,
      status: 'todo',
      date: new Date().toISOString().split('T')[0],
      notes: job.salary ? `Salaire: ${job.salary}` : '',
    })
    setAdded(prev => new Set([...prev, job.id]))
  }

  const isAlreadyAdded = (job) => {
    return added.has(job.id) ||
      existingJobs.some(j => j.company.toLowerCase() === job.company.toLowerCase())
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">🔎</span>
        <h3 className="text-sm font-semibold text-gray-800">Recherche d'offres</h3>
        {!isAdzunaConfigured() && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-auto">
            Mode démo — <a href="https://developer.adzuna.com/" target="_blank" rel="noopener noreferrer" className="underline">Obtenir une clé Adzuna</a>
          </span>
        )}
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">💼</span>
            <input
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Product Manager, UX Designer..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
            />
          </div>
          <div className="relative min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📍</span>
            <input
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Paris, Remote, France..."
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
            />
          </div>
          <button
            onClick={() => handleSearch(1)}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : '🔍'}
            Rechercher
          </button>
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="px-4 py-3 text-sm text-red-500 bg-red-50">{error}</div>
      )}

      {results && (
        <>
          <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100">
            <span className="text-xs text-gray-500">
              {results.total.toLocaleString('fr-FR')} offre{results.total > 1 ? 's' : ''} trouvée{results.total > 1 ? 's' : ''}
            </span>
          </div>

          {results.jobs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm">Aucune offre trouvée</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
              {results.jobs.map(job => {
                const alreadyAdded = isAlreadyAdded(job)
                return (
                  <div key={job.id} className="px-4 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-800">{job.title}</span>
                          {job.contractType && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              {CONTRACT_LABELS[job.contractType] || job.contractType}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-600 font-medium">{job.company}</span>
                          {job.location && (
                            <span className="text-xs text-gray-400">📍 {job.location}</span>
                          )}
                          {job.salary && (
                            <span className="text-xs text-green-600 font-medium">💰 {job.salary}</span>
                          )}
                          {job.date && (
                            <span className="text-xs text-gray-300">{formatDate(job.date)}</span>
                          )}
                        </div>
                        {job.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{job.description}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline whitespace-nowrap"
                          >
                            Voir ↗
                          </a>
                        )}
                        <button
                          onClick={() => handleAdd(job)}
                          disabled={alreadyAdded}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                            alreadyAdded
                              ? 'bg-green-100 text-green-600 cursor-default'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {alreadyAdded ? '✓ Ajouté' : '+ Ajouter'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {results.total > 20 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => handleSearch(page - 1)}
                disabled={page === 1 || loading}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                ← Précédent
              </button>
              <span className="text-xs text-gray-400">Page {page}</span>
              <button
                onClick={() => handleSearch(page + 1)}
                disabled={loading || results.jobs.length < 20}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}

      {!results && !loading && (
        <div className="text-center py-10 text-gray-300">
          <div className="text-3xl mb-2">💼</div>
          <p className="text-sm">Lance une recherche pour trouver des offres</p>
        </div>
      )}
    </div>
  )
}
