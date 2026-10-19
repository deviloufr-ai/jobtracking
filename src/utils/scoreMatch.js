// CV ↔ job match score — shared helpers (app side; the Firefox add-on carries a
// twin of normalizeScoreResult/verdictForScore in background.js — keep them in sync).
//
//  - normalizeScoreResult: validates the model's JSON so a malformed answer can
//    never be stored as a real "0 / PARTIAL_MATCH". The verdict is DERIVED from
//    the score (one source of truth) instead of being a second, independent
//    model output that disagreed with the colour bands.
//  - jdSourceId / buildScoreSignature: the signature stored on the job so the
//    auto-scorer (useAutoScore) and the manual "Score" button agree on when a
//    score is still valid. Add-on-provided scores use the `ext|` prefix so they
//    are kept until a fuller JD arrives.

export const VERDICTS = ['STRONG_MATCH', 'GOOD_MATCH', 'PARTIAL_MATCH', 'WEAK_MATCH']

export function clampScore(value) {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, Math.round(n)))
}

// Same bands as scoreColorClasses (ScoreJob.jsx) and the add-on pill colours.
export function verdictForScore(score) {
  if (score >= 80) return 'STRONG_MATCH'
  if (score >= 60) return 'GOOD_MATCH'
  if (score >= 40) return 'PARTIAL_MATCH'
  return 'WEAK_MATCH'
}

const strList = (v) => (Array.isArray(v) ? v : [])
  .map(x => (typeof x === 'string' ? x : (x == null ? '' : String(x))).trim())
  .filter(Boolean)

/**
 * Validate a raw model answer. Throws when there is no usable score, so callers
 * treat it as a failed call (retry later) rather than persisting garbage.
 */
export function normalizeScoreResult(raw) {
  const score = clampScore(raw?.score)
  if (score === null) throw new Error('Score response missing a numeric score')
  return {
    score,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    strengths: strList(raw.strengths),
    gaps: strList(raw.gaps),
    verdict: verdictForScore(score),
  }
}

// Stable, tiny string hash (detect JD changes without storing the text twice).
export function hashStr(s) {
  let h = 0
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0 }
  return String(h)
}

// Identify the JD source cheaply (without fetching) so a signature can be built.
export function jdSourceId(job) {
  if (!job) return null
  if (job.jobDescription && job.jobDescription.trim()) return 'jd:' + hashStr(job.jobDescription)
  // Backward-compat: older jobs (and the edit modal, historically) stored the JD under `description`.
  if (job.description && job.description.trim()) return 'jd:' + hashStr(job.description)
  if (job.url) return 'url:' + job.url
  if (job.notes && job.notes.trim().length > 40) return 'notes:' + hashStr(job.notes)
  return null
}

export function cvKeyFor(cv) {
  return cv ? 'base:' + cv.id : null
}

export function buildScoreSignature(cvKey, jdId) {
  if (!cvKey || !jdId) return null
  return cvKey + '|' + jdId
}

// Signature for a score computed by the add-on (pill or listing scan). It is
// not tied to a base-CV id (the add-on only knows the CV text), so it stays
// valid while the JD it was computed on is unchanged.
export function extScoreSignature(job) {
  const jdId = jdSourceId(job)
  return jdId ? 'ext|' + jdId : null
}

// Build the { score, scoreDetails, scoreSignature } patch for a job from an
// add-on score payload ({ score, verdict?, summary?/reason?, strengths?, gaps?,
// source?, cvName? }). Returns null when there is nothing usable.
export function scorePatchFromExtension(job, ext) {
  const score = clampScore(ext?.score)
  if (score === null) return null
  const signature = extScoreSignature(job)
  if (!signature) return null
  return {
    score,
    scoreSignature: signature,
    scoreDetails: {
      summary: (ext.summary || ext.reason || '').toString().trim(),
      strengths: strList(ext.strengths),
      gaps: strList(ext.gaps),
      verdict: verdictForScore(score),
      cvName: ext.cvName || 'CV (add-on)',
      scoredAt: new Date().toISOString(),
      source: ext.source || 'extension',
      // A listing-scan score only saw the card (title/company/snippet), not the
      // full posting — the UI flags it as provisional.
      provisional: ext.source === 'listing',
    },
  }
}
