import { useState, useEffect } from 'react'

export default function CommuteInfo({ homeAddress, companyAddress, companyName }) {
  const [commute, setCommute] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!homeAddress || !companyAddress) {
      setCommute(null)
      return
    }

    const fetchCommute = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ homeAddress, companyAddress }),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'Failed to calculate commute')
          return
        }

        const data = await res.json()
        setCommute(data)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchCommute()
  }, [homeAddress, companyAddress])

  if (!homeAddress || !companyAddress) return null

  // `api=1` is REQUIRED — without it Maps ignores origin/destination and opens
  // an empty directions panel.
  const googleMapsUrl = new URLSearchParams({
    api: '1',
    origin: homeAddress,
    destination: companyAddress,
    travelmode: 'driving',
  })

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
        <span>Calculating commute...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-600">
        <span>⚠️</span>
        <span>{error}</span>
      </div>
    )
  }

  if (!commute) return null

  return (
    <a
      href={`https://www.google.com/maps/dir/?${googleMapsUrl}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition-colors group"
      title={`Drive: ${commute.durationText} · ${commute.distanceText} — open in Google Maps`}
    >
      <span className="text-lg">🚗</span>
      <span className="inline-flex items-center gap-1">⏱️ {commute.durationText}</span>
      <span className="text-xs text-gray-400 group-hover:text-gray-600">· {commute.distanceText}</span>
      <span className="text-indigo-400 ml-1">↗</span>
    </a>
  )
}
