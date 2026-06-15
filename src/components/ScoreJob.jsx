import { useState } from 'react'
import { useCVs } from '../hooks/useCVs'

// Color band for a 0-100 score — shared by the table badge and the modal.
export function scoreColorClasses(s) {
  if (s >= 80) return 'bg-green-100 text-green-700 border-green-300'
  if (s >= 60) return 'bg-blue-100 text-blue-700 border-blue-300'
  if (s >= 40) return 'bg-amber-100 text-amber-700 border-amber-300'
  return 'bg-red-100 text-red-700 border-red-300'
}

// Compact score pill shown in the job table. Renders nothing if not yet scored.
export function ScoreBadge({ job, t = (key) => key }) {
  const score = job?.score
  if (score === null || score === undefined) return null
  const details = job.scoreDetails
  const title = details?.summary
    ? `${details.verdict?.replace(/_/g, ' ') || ''} — ${details.summary}\n${t('scoreJob.scoredWith') || 'Scored with'}: ${details.cvName || ''}`
    : `${t('scoreJob.title') || 'Match score'}: ${Math.round(score)}/100`
  return (
    <span
      title={title}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${scoreColorClasses(score)}`}
    >
      {Math.round(score)}
    </span>
  )
}

export default function ScoreJob({ job, onUpdateScore, t = (key) => key }) {
  const { cvs } = useCVs()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedCvId, setSelectedCvId] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  const score = job?.score
  const scoreDetails = job?.scoreDetails

  const getScoreColor = (s) => {
    if (s >= 80) return 'bg-green-100 text-green-800 border-green-300'
    if (s >= 60) return 'bg-blue-100 text-blue-800 border-blue-300'
    if (s >= 40) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-red-100 text-red-800 border-red-300'
  }

  const getVerdictIcon = (verdict) => {
    switch (verdict) {
      case 'STRONG_MATCH': return '✓'
      case 'GOOD_MATCH': return '✓'
      case 'PARTIAL_MATCH': return '◐'
      case 'WEAK_MATCH': return '✗'
      default: return '−'
    }
  }

  const handleCalculateScore = async () => {
    if (!selectedCvId && cvs.length > 0) {
      // Auto-select first CV if available
      setSelectedCvId(cvs[0].id)
    }

    const cv = cvs.find(c => c.id === (selectedCvId || cvs[0]?.id))
    if (!cv) {
      setError(t('scoreJob.noCVSelected') || 'No CV selected')
      return
    }

    if (!job?.position || !job?.company) {
      setError(t('scoreJob.incompleteJob') || 'Job details incomplete')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/score-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText: cv.text,
          jobDescription: job.jobDescription || job.description || job.notes || '',
          company: job.company,
          position: job.position
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Scoring failed')

      onUpdateScore({
        score: data.score,
        scoreDetails: {
          summary: data.summary,
          strengths: data.strengths,
          gaps: data.gaps,
          verdict: data.verdict,
          cvName: cv.name,
          scoredAt: data.scoredAt
        }
      })
      setShowDetails(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          {t('scoreJob.title') || '📊 Job Match Score'}
        </h3>
        {score !== null && score !== undefined && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-indigo-600 hover:text-indigo-700 underline"
          >
            {showDetails ? t('scoreJob.hideDetails') || 'Hide' : t('scoreJob.showDetails') || 'Details'}
          </button>
        )}
      </div>

      {score !== null && score !== undefined ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className={`flex items-center justify-center w-16 h-16 rounded-full border-2 font-bold text-lg ${getScoreColor(score)}`}>
              {Math.round(score)}
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600">{scoreDetails?.summary}</p>
              <p className="text-xs text-gray-500 mt-1">
                {t('scoreJob.scoredWith') || 'Scored with'}: <span className="font-medium">{scoreDetails?.cvName}</span>
              </p>
            </div>
            {scoreDetails?.verdict && (
              <div className="text-center">
                <div className="text-2xl font-bold">{getVerdictIcon(scoreDetails.verdict)}</div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mt-1">
                  {scoreDetails.verdict.replace(/_/g, ' ')}
                </p>
              </div>
            )}
          </div>

          {showDetails && scoreDetails && (
            <div className="bg-white rounded border border-gray-200 p-3 space-y-3">
              {scoreDetails.strengths?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1.5">✓ {t('scoreJob.strengths') || 'Strengths'}</p>
                  <ul className="space-y-1">
                    {scoreDetails.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-gray-700 flex gap-2">
                        <span className="text-green-600 flex-shrink-0">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {scoreDetails.gaps?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">⚠ {t('scoreJob.gaps') || 'Experience Gaps'}</p>
                  <ul className="space-y-1">
                    {scoreDetails.gaps.map((g, i) => (
                      <li key={i} className="text-xs text-gray-700 flex gap-2">
                        <span className="text-amber-600 flex-shrink-0">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[10px] text-gray-500">
                {t('scoreJob.scoredDate') || 'Scored'}: {new Date(scoreDetails.scoredAt).toLocaleDateString()}
              </p>
            </div>
          )}

          <button
            onClick={handleCalculateScore}
            disabled={loading || cvs.length === 0}
            className="w-full mt-2 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t('scoreJob.calculating') || 'Calculating...' : t('scoreJob.recalculate') || 'Recalculate with CV'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {t('scoreJob.description') || 'Compare this job with your CV to get a match score.'}
          </p>

          {cvs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                {t('scoreJob.selectCV') || 'Select CV'}
              </label>
              <select
                value={selectedCvId || ''}
                onChange={e => setSelectedCvId(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">{t('scoreJob.chooseCV') || 'Choose a CV...'}</option>
                {cvs.map(cv => (
                  <option key={cv.id} value={cv.id}>{cv.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </p>
          )}

          <button
            onClick={handleCalculateScore}
            disabled={loading || cvs.length === 0}
            className="w-full px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t('scoreJob.calculating') || 'Calculating...' : t('scoreJob.scoreJob') || 'Score This Job'}
          </button>

          {cvs.length === 0 && (
            <p className="text-xs text-gray-500 italic">
              {t('scoreJob.uploadCVFirst') || 'Upload a CV to score this job.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
