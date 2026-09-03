// Timeline-note formatting helpers.
//
// A stored history note can carry several sub-notes joined by ' | ' — same-day
// entries are merged on load (see useJobs mergeSameDateEntries), so e.g. two
// separate rejection emails end up as
//   "Refus explicite … mieux | Refus explicite … suivi futures offres"
// Rendering that raw shows an ugly pipe run-on. `noteLines` splits it back into
// its parts so the UI can show one line/bullet each, and drops exact/normalized
// duplicate parts (a note that got doubled) while keeping genuinely different
// ones (two distinct emails).
export function noteLines(note = '') {
  const parts = String(note || '')
    .split(' | ')
    .map(p => p.trim())
    .filter(Boolean)
  const seen = new Set()
  const out = []
  for (const p of parts) {
    // Normalize for dedup only (compare punctuation/case-insensitively); the
    // original text is what we render.
    const norm = p.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (norm && seen.has(norm)) continue
    seen.add(norm)
    out.push(p)
  }
  return out
}
