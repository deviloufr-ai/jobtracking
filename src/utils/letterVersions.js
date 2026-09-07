// Cover-letter version history helpers — pure, side-effect free.
//
// Historically a job kept a single `letterSaved` ({ content, savedAt }); saving a
// regenerated letter overwrote it and the previous draft was lost. These helpers
// keep a bounded history in `job.letterVersions` (newest first) while `letterSaved`
// stays the CURRENT letter for backward compatibility (MergeModal, the inline
// viewers and the extension all still read `letterSaved`). Both fields ride the
// jobs.extras jsonb blob (see syncManager EXTRA_FIELDS), so history syncs too.

export const MAX_LETTER_VERSIONS = 10

function genId() {
  try { return crypto.randomUUID() } catch { return `lv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
}

// Build the patch to persist when saving `content` as the current letter.
// Returns { letterSaved, letterVersions } ready to hand to updateJob(id, patch).
//
// - No-ops (returns the existing pair) when `content` is blank or identical to the
//   current letter, so repeatedly hitting Save doesn't spawn duplicate versions.
// - Caps history at MAX_LETTER_VERSIONS, dropping the oldest.
export function pushLetterVersion(job, content, max = MAX_LETTER_VERSIONS) {
  const text = (content || '').trim()
  const existing = Array.isArray(job?.letterVersions) ? job.letterVersions : []
  if (!text) {
    return { letterSaved: job?.letterSaved || null, letterVersions: existing }
  }

  const savedAt = new Date().toISOString()
  const current = { content, savedAt }

  // Identical to what's already current → nothing to save, keep history untouched.
  if (job?.letterSaved && (job.letterSaved.content || '').trim() === text) {
    return { letterSaved: job.letterSaved, letterVersions: existing }
  }

  // Capture the OUTGOING current letter into history before it's replaced, so a
  // letter saved before version history existed (or any prior draft not yet in the
  // list) is preserved rather than silently lost.
  const prior = (job?.letterSaved?.content || '').trim()
  let base = existing
  if (prior && !existing.some(v => (v.content || '').trim() === prior)) {
    base = [{ id: genId(), content: job.letterSaved.content, savedAt: job.letterSaved.savedAt || savedAt }, ...existing]
  }

  // Prepend the new version; drop any existing copy of the same content first.
  const deduped = base.filter(v => (v.content || '').trim() !== text)
  const versions = [{ id: genId(), content, savedAt }, ...deduped].slice(0, max)
  return { letterSaved: current, letterVersions: versions }
}

// Build the patch to restore a stored version as the current letter. The restored
// version is re-inserted at the head with a fresh timestamp so restoring twice is
// idempotent and the restored copy becomes the newest.
export function restoreLetterVersion(job, versionId) {
  const existing = Array.isArray(job?.letterVersions) ? job.letterVersions : []
  const target = existing.find(v => v.id === versionId)
  if (!target) return null
  return pushLetterVersion(job, target.content)
}
