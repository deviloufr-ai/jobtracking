// Presentation helpers for the CV ↔ job match score (plain functions — kept out
// of ScoreJob.jsx so that file only exports components, as react-refresh wants).

// Color band for a 0-100 score — shared by the table badge, the drawer and the modal.
export function scoreColorClasses(s) {
  if (s >= 80) return 'bg-green-100 text-green-700 border-green-300'
  if (s >= 60) return 'bg-blue-100 text-blue-700 border-blue-300'
  if (s >= 40) return 'bg-amber-100 text-amber-700 border-amber-300'
  return 'bg-red-100 text-red-700 border-red-300'
}

// A provisional score came from the add-on's listing scan: it only saw the
// search-result card (title/company/snippet), not the full posting. Rendered
// with a dashed border + "~" prefix so it is never mistaken for a full-JD score.
export function isProvisionalScore(job) {
  return !!job?.scoreDetails?.provisional
}
export function provisionalScoreClasses(job) {
  return isProvisionalScore(job) ? 'border-dashed' : ''
}
export function scoreTitle(job, t = (key) => key) {
  if (!isProvisionalScore(job)) return ''
  return t('scoreJob.provisional') || 'Provisional score — based on the listing preview, not the full posting'
}
export function formatScore(job) {
  const s = Math.round(job?.score ?? 0)
  return isProvisionalScore(job) ? `~${s}` : String(s)
}

export function getVerdictIcon(verdict) {
  switch (verdict) {
    case 'STRONG_MATCH': return '✓'
    case 'GOOD_MATCH': return '✓'
    case 'PARTIAL_MATCH': return '◐'
    case 'WEAK_MATCH': return '✗'
    default: return '−'
  }
}

export function getVerdictColor(verdict) {
  switch (verdict) {
    case 'STRONG_MATCH': return 'text-green-700 bg-green-50'
    case 'GOOD_MATCH': return 'text-blue-700 bg-blue-50'
    case 'PARTIAL_MATCH': return 'text-amber-700 bg-amber-50'
    case 'WEAK_MATCH': return 'text-red-700 bg-red-50'
    default: return 'text-gray-700 bg-gray-50'
  }
}
