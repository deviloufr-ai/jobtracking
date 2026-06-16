import { useState } from 'react'
import { extractCompanyAddress } from '../services/extractAddress'

export default function BulkAddressFiller({ jobs, onUpdateJobs, apiKey, t = (key) => key }) {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [selectedAddresses, setSelectedAddresses] = useState({})

  const jobsNeedingAddress = jobs.filter(j => j.description && !j.companyAddress)

  if (!jobsNeedingAddress.length) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-700">✓ All jobs have company addresses or no description to extract from.</p>
      </div>
    )
  }

  const handleFillAddresses = async () => {
    if (!apiKey) {
      alert('Please add your Claude API key in Settings first.')
      return
    }

    setIsRunning(true)
    setProgress(0)
    setResults([])
    const extracted = []

    for (let i = 0; i < jobsNeedingAddress.length; i++) {
      const job = jobsNeedingAddress[i]
      setProgress(Math.round((i / jobsNeedingAddress.length) * 100))

      try {
        const address = await extractCompanyAddress(
          job.company,
          job.description,
          job.url,
          apiKey
        )
        if (address) {
          extracted.push({ jobId: job.id, company: job.company, address, position: job.position })
          setSelectedAddresses(prev => ({ ...prev, [job.id]: true }))
        }
      } catch (e) {
        console.error(`Failed for ${job.company}:`, e.message)
      }
    }

    setProgress(100)
    setResults(extracted)
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
            Found <strong>{jobsNeedingAddress.length}</strong> jobs with descriptions but no company address.
          </p>
          <button
            onClick={handleFillAddresses}
            disabled={isRunning}
            className="w-full text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isRunning ? `Extracting... ${progress}%` : '🔍 Auto-fill from Job Descriptions'}
          </button>
        </>
      ) : (
        <>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-medium text-green-800">✓ Found {results.length} addresses</p>
          </div>

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
      )}
    </div>
  )
}
