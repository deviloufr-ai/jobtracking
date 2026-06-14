import { useState, useCallback, useEffect, useRef } from 'react'
import { searchJobs, getSavedAPI, setActiveAPI, getAvailableAPIs, getAPIName } from '../services/jobSearch'
import { FRENCH_LOCATIONS, getLocationsByQuery, getLocationLabel } from '../services/adzunaLocations'
import { ROME_CODES, searchRomeCodes, detectRomeCode } from '../services/romeCodesRef'

const CONTRACT_LABELS = {
  permanent: 'CDI',
  contract: 'CDD',
  part_time: 'Temps partiel',
  temporary: 'Intérim',
}

const STORAGE_KEY_HISTORY = 'jobSearch_history'
const STORAGE_KEY_LAST = 'jobSearch_last'

export default function JobSearch({ onAddJob, existingJobs, t = (key) => key }) {
  const [query, setQuery] = useState('Product Manager')
  const [romeCode, setRomeCode] = useState('')
  const [romeInput, setRomeInput] = useState('')
  const [romeSuggestions, setRomeSuggestions] = useState([])
  const [showRomeSuggestions, setShowRomeSuggestions] = useState(false)
  const [location, setLocation] = useState('france')
  const [locationInput, setLocationInput] = useState(getLocationLabel('france'))
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [added, setAdded] = useState(new Set())
  const [sortOrder, setSortOrder] = useState('newest')
  const [showQueryHistory, setShowQueryHistory] = useState(false)
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [activeAPI, setActiveAPIState] = useState(getSavedAPI())
  const [availableAPIs, setAvailableAPIs] = useState(getAvailableAPIs())
  const queryInputRef = useRef(null)
  const locationInputRef = useRef(null)
  const romeInputRef = useRef(null)

  const getSearchHistory = () => {
    const stored = localStorage.getItem(STORAGE_KEY_HISTORY)
    return stored ? JSON.parse(stored) : []
  }

  const saveSearchToHistory = (q, loc) => {
    const history = getSearchHistory()
    const newSearch = { query: q, location: loc, timestamp: new Date().toISOString() }
    const filtered = history.filter(s => !(s.query === q && s.location === loc))
    const updated = [newSearch, ...filtered].slice(0, 10) // Keep last 10
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated))
    localStorage.setItem(STORAGE_KEY_LAST, JSON.stringify(newSearch))
  }

  const handleSearch = useCallback(async (p = 1, q = query, loc = location, rome = romeCode) => {
    // Always auto-detect ROME code from query (unless explicitly provided via ROME input field)
    let searchQuery = q.trim()
    let detectedRome = null

    if (searchQuery) {
      detectedRome = detectRomeCode(searchQuery)
      if (detectedRome) {
        searchQuery = detectedRome
        setRomeCode(detectedRome)
      } else if (rome) {
        // If detection failed but user manually set a ROME code, use that
        searchQuery = rome
      }
    } else if (rome) {
      // If no query but ROME code is set, use ROME code
      searchQuery = rome
    }

    if (!searchQuery) return

    setLoading(true)
    setError(null)
    setPage(p)
    try {
      const data = await searchJobs(activeAPI, { query: searchQuery, location: loc, page: p })
      setResults(data)
      if (p === 1) saveSearchToHistory(searchQuery, loc)
    } catch (e) {
      setError(t('jobSearch.searching') + ' error: ' + e.message)
    }
    setLoading(false)
  }, [activeAPI, query, romeCode])

  useEffect(() => {
    const last = localStorage.getItem(STORAGE_KEY_LAST)
    if (last) {
      const { query: lastQuery, location: lastLocation } = JSON.parse(last)
      setQuery(lastQuery)
      setLocation(lastLocation)
      handleSearch(1, lastQuery, lastLocation)
    }
  }, [])

  useEffect(() => {
    if (results?.jobs?.length > 0 && !selectedJob) {
      setSelectedJob(results.jobs[0])
    }
  }, [results])

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

  const getSortedJobs = () => {
    if (!results?.jobs) return []
    const sorted = [...results.jobs]
    return sorted.sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
    })
  }

  const handleSelectHistory = (h) => {
    setQuery(h.query)
    setLocation(h.location)
    setLocationInput(getLocationLabel(h.location))
    setShowQueryHistory(false)
    setShowLocationSuggestions(false)
    handleSearch(1, h.query, h.location)
  }

  const handleLocationInputChange = (input) => {
    setLocationInput(input)
    const suggestions = getLocationsByQuery(input)
    setLocationSuggestions(suggestions)
  }

  const handleSelectLocation = (loc) => {
    setLocation(loc.value)
    setLocationInput(loc.label)
    setShowLocationSuggestions(false)
  }

  const handleAPIChange = (newAPI) => {
    setActiveAPIState(newAPI)
    setActiveAPI(newAPI)
    setResults(null)
  }

  const handleRomeInputChange = (input) => {
    setRomeInput(input)
    const suggestions = searchRomeCodes(input)
    setRomeSuggestions(suggestions)
  }

  const handleSelectRome = (rome) => {
    setRomeCode(rome.code)
    setRomeInput(rome.label)
    setShowRomeSuggestions(false)
  }

  const handleClearRome = () => {
    setRomeCode('')
    setRomeInput('')
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${selectedJob ? 'flex flex-col' : ''}`} style={selectedJob ? { minHeight: '70vh' } : {}}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🔎</span>
          <h3 className="text-sm font-semibold text-gray-800">{t('jobSearch.title')}</h3>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-gray-500">API:</span>
          {availableAPIs.map(api => (
            <button
              key={api.id}
              onClick={() => handleAPIChange(api.id)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                activeAPI === api.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!api.configured ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!api.configured}
              title={!api.configured ? 'API not configured' : `Switch to ${api.name}`}
            >
              {api.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">💼</span>
            <input
              ref={queryInputRef}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Product Manager, UX Designer..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(1, query, location)}
              onFocus={() => setShowQueryHistory(true)}
              onBlur={() => setTimeout(() => setShowQueryHistory(false), 150)}
            />
            {showQueryHistory && getSearchHistory().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                {getSearchHistory().map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectHistory(h)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 border-b border-gray-100 last:border-0 flex items-center gap-2"
                  >
                    <span className="text-xs text-gray-400">💼</span>
                    <span>{h.query}</span>
                    <span className="ml-auto text-xs text-gray-400">{h.location}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📍</span>
            <input
              ref={locationInputRef}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Paris, Amiens, Île-de-France..."
              value={locationInput}
              onChange={e => handleLocationInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(1, query, location)}
              onFocus={() => setShowLocationSuggestions(true)}
              onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 150)}
              autoComplete="off"
            />
            {showLocationSuggestions && locationSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {locationSuggestions.map((loc, i) => (
                  <button
                    key={i}
                    onMouseDown={() => handleSelectLocation(loc)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 border-b border-gray-100 last:border-0 flex items-center justify-between"
                  >
                    <span>{loc.label}</span>
                    {loc.region && <span className="ml-2 text-xs text-gray-400">{loc.region}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">📋</span>
            <input
              ref={romeInputRef}
              className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="ROME code (M1402, H2202...)"
              value={romeInput}
              onChange={e => handleRomeInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(1, query, location, romeCode)}
              onFocus={() => setShowRomeSuggestions(true)}
              onBlur={() => setTimeout(() => setShowRomeSuggestions(false), 150)}
              autoComplete="off"
            />
            {romeCode && (
              <button
                onClick={handleClearRome}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
            {showRomeSuggestions && romeSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                {romeSuggestions.map((rome, i) => (
                  <button
                    key={i}
                    onMouseDown={() => handleSelectRome(rome)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 border-b border-gray-100 last:border-0"
                  >
                    <span className="font-mono font-bold text-indigo-600">{rome.code}</span>
                    <span className="ml-2">{rome.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => handleSearch(1, query, location, romeCode)}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : '🔍'}
            {t('jobSearch.search')}
          </button>
        </div>
      </div>

      {/* Results + Detail Panel */}
      {error && (
        <div className="px-4 py-3 text-sm text-red-500 bg-red-50">{error}</div>
      )}

      {results && (
        <div className={selectedJob ? 'flex-1 min-h-0 flex overflow-hidden' : ''}>
          {/* List side */}
          <div className={selectedJob ? 'w-80 flex flex-col border-r border-gray-100' : ''}>
            <div className={`px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between ${selectedJob ? 'flex-shrink-0' : ''}`}>
              <span className="text-xs text-gray-500">
                {results.total.toLocaleString('fr-FR')} offre{results.total > 1 ? 's' : ''} trouvée{results.total > 1 ? 's' : ''}
              </span>
              {results.jobs.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Tri:</span>
                  <select
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white hover:bg-gray-50 cursor-pointer"
                  >
                    <option value="newest">📅 Plus récent</option>
                    <option value="oldest">📅 Plus ancien</option>
                  </select>
                </div>
              )}
            </div>

            {results.jobs.length === 0 ? (
              <div className={`text-center py-10 text-gray-400 ${selectedJob ? 'flex-1' : ''}`}>
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-sm">Aucune offre trouvée</p>
              </div>
            ) : (
              <div className={`divide-y divide-gray-50 overflow-y-auto ${selectedJob ? 'flex-1' : 'max-h-[480px]'}`}>
                {getSortedJobs().map(job => {
                  const isSelected = selectedJob?.id === job.id
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`px-4 py-3 cursor-pointer transition-colors border-l-2 ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-600'
                          : 'hover:bg-gray-50/60 border-transparent'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-800">{job.title}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {job.company}
                        {job.salary && <span className="text-green-600 font-medium"> • {job.salary.split(' ')[0]}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {results.total > 20 && (
              <div className={`px-4 py-3 border-t border-gray-100 flex items-center justify-between ${selectedJob ? 'flex-shrink-0' : ''}`}>
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
          </div>

          {/* Detail Panel */}
          {selectedJob && (
            <div className="flex-1 bg-white border-l border-gray-100 flex flex-col overflow-hidden">
              {/* Detail Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{selectedJob.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{selectedJob.company}</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-indigo-50 p-2 rounded border border-indigo-100">
                    <div className="text-xs text-indigo-600 font-medium">Salaire</div>
                    <div className="text-sm font-semibold text-indigo-900">{selectedJob.salary || '—'}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-xs text-gray-600 font-medium">Type</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {selectedJob.contractType ? CONTRACT_LABELS[selectedJob.contractType] || selectedJob.contractType : '—'}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-xs text-gray-600 font-medium">Localisation</div>
                    <div className="text-sm font-semibold text-gray-900">{selectedJob.location || '—'}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-xs text-gray-600 font-medium">Catégorie</div>
                    <div className="text-sm font-semibold text-gray-900">{selectedJob.category || '—'}</div>
                  </div>
                </div>

                {/* Posted Date */}
                {selectedJob.date && (
                  <div className="mb-4 pb-3 border-b border-gray-100">
                    <div className="text-xs text-gray-500 font-medium">Publié le</div>
                    <div className="text-sm text-gray-700 mt-1">{formatDate(selectedJob.date)}</div>
                  </div>
                )}

                {/* Description */}
                {selectedJob.description && (
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-2">Description</div>
                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto pr-2">
                      {selectedJob.description.substring(0, 2000)}
                      {selectedJob.description.length > 2000 && '...'}
                    </div>
                  </div>
                )}
              </div>

              {/* Detail Actions */}
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    handleAdd(selectedJob)
                    setSelectedJob(null)
                  }}
                  disabled={isAlreadyAdded(selectedJob)}
                  className={`flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
                    isAlreadyAdded(selectedJob)
                      ? 'bg-green-100 text-green-600 cursor-default'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isAlreadyAdded(selectedJob) ? '✓ Ajouté' : '+ Ajouter'}
                </button>
                {selectedJob.url && (
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-xs font-medium py-2 px-3 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-center"
                  >
                    Voir ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className={selectedJob ? 'flex-1 flex items-center justify-center text-gray-300' : 'text-center py-10 text-gray-300'}>
          <div className="text-center">
            <div className="text-3xl mb-2">💼</div>
            <p className="text-sm">Lance une recherche pour trouver des offres</p>
          </div>
        </div>
      )}
    </div>
  )
}
