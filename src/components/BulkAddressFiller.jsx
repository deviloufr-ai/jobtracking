import { useState } from 'react'

// Generic / placeholder "company" names that aren't real companies to look up
const SKIP_COMPANIES = new Set(['unknown', 'remote', 'linkedin', 'greenhouse', 'jobgether', ''])

export default function BulkAddressFiller({ jobs, onUpdateJobs, t = (key) => key }) {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [selectedAddresses, setSelectedAddresses] = useState({})
  const [errorReason, setErrorReason] = useState(null)

  // Google Places only needs the company name — not a job description.
  const jobsNeedingAddress = jobs.filter(j =>
    j.company && !j.companyAddress && !SKIP_COMPANIES.has(j.company.trim().toLowerCase())
  )

  if (!jobsNeedingAddress.length) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-700">✓ All jobs have company addresses or no description to extract from.</p>
      </div>
    )
  }

  const handleFillAddresses = async () => {
    setIsRunning(true)
    setProgress(0)
    setResults([])
    setErrorReason(null)
    const extracted = []
    const addressByCompany = new Map() // cache: same company looked up once
    let firstReason = null

    for (let i = 0; i < jobsNeedingAddress.length; i++) {
      const job = jobsNeedingAddress[i]
      setProgress(Math.round((i / jobsNeedingAddress.length) * 100))

      const key = job.company.trim().toLowerCase()
      try {
        let address = addressByCompany.get(key)
        if (address === undefined) {
          const res = await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyName: job.company })
          })
          const data = await res.json().catch(() => ({}))

          if (!res.ok) {
            // 4xx/5xx → capture the server error (e.g. key not configured)
            if (!firstReason) firstReason = data.error || `HTTP ${res.status}`
            address = null
          } else {
            // 200 but address may be null when Google denied/zero-results
            if (!data.address && data.reason && !firstReason) firstReason = data.reason
            address = data.address || null
          }
          addressByCompany.set(key, address)
        }

        if (address) {
          extracted.push({ jobId: job.id, company: job.company, address, position: job.position })
          setSelectedAddresses(prev => ({ ...prev, [job.id]: true }))
        }
      } catch (e) {
        console.error(`Failed for ${job.company}:`, e.message)
        if (!firstReason) firstReason = e.message
      }
    }

    setProgress(100)
    setResults(extracted)
    setErrorReason(extracted.length === 0 ? firstReason : null)
    setShowResults(true)
    setIsRunning(false)
  }

  const handleApply = () => {
    const updates = results
      .filter(r => selectedAddresses[r.jobId])
      .reduce((acc, r) => {
        acc[r.jobId] = r.address
        return acc
      }, {})

    const updatedJobs = jobs.map(j =>
      updates[j.id] ? { ...j, companyAddress: updates[j.id] } : j
    )

    onUpdateJobs(updatedJobs)
    setShowResults(false)
    setResults([])
  }

  return (
    <div className="space-y-3">
      {!showResults ? (
        <>
          <p className="text-sm text-gray-600">
            Found <strong>{jobsNeedingAddress.length}</strong> jobs without company addresses.
          </p>
          <p className="text-xs text-gray-500">
            Will search Google for each company and fetch their official addresses.
          </p>
          <button
            onClick={handleFillAddresses}
            disabled={isRunning}
            className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isRunning ? `Fetching... ${progress}%` : '🔍 Fetch All Addresses'}
          </button>
</>
      ) : (
        <>
          <div className={`rounded-lg p-3 ${
            results.length > 0
              ? 'bg-green-50 border border-green-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <p className={`text-sm font-medium ${
              results.length > 0
                ? 'text-green-800'
                : 'text-amber-800'
            }`}>
              {results.length > 0
                ? `✓ Found ${results.length} address${results.length !== 1 ? 'es' : ''}`
                : '⚠️ No addresses found'}
            </p>
            {results.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {errorReason
                  ? <>Google returned: <code className="font-mono">{errorReason}</code>. {errorReason.includes('REQUEST_DENIED') || errorReason.includes('not configured')
                      ? 'Check that the Places API is enabled and the API key has no HTTP-referrer restriction (server-side calls need an IP/none or API-only restriction).'
                      : 'Try again or add addresses manually.'}</>
                  : 'No addresses found. Try adding them manually or check company websites.'}
              </p>
            )}
          </div>

          {results.length > 0 ? (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.map(r => (
                  <label key={r.jobId} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={selectedAddresses[r.jobId] || false}
                      onChange={e => setSelectedAddresses(prev => ({ ...prev, [r.jobId]: e.target.checked }))}
                      className="mt-1 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{r.company}</p>
                      <p className="text-xs text-gray-600">{r.address}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowResults(false)}
                  className="flex-1 text-sm font-medium text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={!Object.values(selectedAddresses).some(v => v)}
                  className="flex-1 text-sm font-medium bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  ✓ Apply Selected
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowResults(false)}
                className="flex-1 text-sm font-medium text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ✕ Close
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
