// Learned generation rules — lessons distilled from the candidate's own rejected
// applications (by the rejection analysis) that feed back into CV and cover-letter
// generation. The user reviews and TOGGLES each rule; only the enabled ones are
// injected into the generation prompts. Persisted in localStorage, mirroring how
// the user's own CV custom rules are stored (see cvGeneration.js).
//
// Shape: { id, text, area: 'cv' | 'letter', enabled, addedAt }
import { uid } from '../utils/uid'

const KEY = 'jobtrackr_learned_rules'

export function loadLearnedRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    return Array.isArray(saved) ? saved.filter(r => r && typeof r.text === 'string') : []
  } catch { return [] }
}

export function saveLearnedRules(rules) {
  try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(rules) ? rules : [])) } catch { /* ignore */ }
}

// The enabled rules for one generation area, as newline-joined text ready to drop
// into a prompt. Empty string when there are none (caller omits the block).
export function enabledLearnedRulesText(area) {
  return loadLearnedRules()
    .filter(r => r.enabled && r.area === area && r.text.trim())
    .map(r => `- ${r.text.trim()}`)
    .join('\n')
}

// Merge a freshly-analysed set of rules into the stored ones. New rules (by
// normalized text) are added DISABLED so nothing silently changes generation until
// the user opts in; rules the user already toggled keep their enabled state.
export function mergeLearnedRules(incoming) {
  const existing = loadLearnedRules()
  const seen = new Map(existing.map(r => [r.area + '|' + r.text.trim().toLowerCase(), r]))
  const now = new Date().toISOString()
  for (const item of incoming || []) {
    const text = String(item?.text || '').trim()
    const area = item?.area === 'letter' ? 'letter' : 'cv'
    if (!text) continue
    const k = area + '|' + text.toLowerCase()
    if (seen.has(k)) continue
    const rule = { id: uid('rule'), text, area, enabled: false, addedAt: now }
    existing.push(rule)
    seen.set(k, rule)
  }
  saveLearnedRules(existing)
  return existing
}
