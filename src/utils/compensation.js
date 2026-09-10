// Compensation helpers — pure functions for the per-application comp/offer data
// stored on `job.compensation` (rides the jobs.extras jsonb blob, see syncManager
// EXTRA_FIELDS). Kept side-effect free so they're unit-testable and reusable by
// the editor, the sidebar summary and the cross-job Offer Comparison view.
//
// Shape (all fields optional):
//   {
//     currency:   'EUR' | 'USD' | 'GBP' | 'CHF' | 'CAD',
//     basePeriod: 'year' | 'month',     // how `base` is expressed (default year)
//     base:       number,               // salary in basePeriod units
//     bonus:      number,               // annual target bonus (amount, same currency)
//     equity:     number,               // annualized equity value
//     benefits:   string,               // free text (car, tickets, health…)
//     remotePct:  number,               // 0..100
//     location:   string,
//     stage:      'expected'|'offered'|'negotiating'|'accepted'|'declined',
//     notes:      string,
//     updatedAt:  ISO string,
//     // Set by the "fill remuneration from the web" flow (services/salaryFetch):
//     estimated:  boolean,              // true → a web-researched estimate, not a real offer
//     baseMin:    number,               // researched annual range low  (same currency)
//     baseMax:    number,               // researched annual range high
//     source:     string,              // where it came from, e.g. 'Glassdoor'
//     confidence: 'high'|'medium'|'low',
//   }

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD']

export const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', CAD: 'CA$' }

// Offer stages, in funnel order. Labels are resolved via t() in the UI.
export const COMP_STAGES = ['expected', 'offered', 'negotiating', 'accepted', 'declined']

// Coerce a user-entered numeric field to a finite number or null. The app is
// bilingual FR/EN, so both "65 000 €" / "65,5k" (French) and "65,000" / "1,234.56"
// (English) must parse correctly — a naive comma→dot swap turns "65,000" into 65.
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  // Lowercase, drop currency glyphs and ALL whitespace (incl. the NBSP / narrow
  // NBSP that fr-FR uses as a thousands separator).
  let s = String(value).trim().toLowerCase().replace(/[€$£]/g, '').replace(/\s/g, '')
  let mult = 1
  if (s.endsWith('k')) { mult = 1000; s = s.slice(0, -1) }

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // Both present: the rightmost separator is the decimal point, the other groups
    // thousands. Handles "1,234.56" (EN) and "1.234,56" (FR) alike.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    s = s.split(thou).join('').replace(dec, '.')
  } else if (hasComma) {
    // Comma alone: a decimal only when it introduces a 1-2 digit fraction ("65,5");
    // a comma before a 3-digit group is thousands ("65,000" → 65000).
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.split(',').join('')
  } else if (hasDot) {
    s = /\.\d{1,2}$/.test(s) ? s : s.split('.').join('')
  }

  const n = parseFloat(s)
  return Number.isFinite(n) ? n * mult : null
}

// Annualize the base salary (month → ×12). Returns null when no base is set.
export function annualBase(comp) {
  if (!comp) return null
  const base = toNumber(comp.base)
  if (base === null) return null
  return comp.basePeriod === 'month' ? base * 12 : base
}

// Total annual compensation = annual base + annual bonus + annualized equity.
// Returns null only when NOTHING numeric is set, so a base-only offer still totals.
export function totalComp(comp) {
  if (!comp) return null
  const parts = [annualBase(comp), toNumber(comp?.bonus), toNumber(comp?.equity)]
  const present = parts.filter(p => p !== null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0)
}

// True when the record carries any numeric comp value worth displaying.
export function hasCompensation(comp) {
  if (!comp) return false
  return [comp.base, comp.bonus, comp.equity].some(v => toNumber(v) !== null)
}

// Format an amount as a compact, locale-agnostic money string. Rounds to k above
// 10 000 to keep tables tidy ("65k €"); shows the full number below that.
export function formatMoney(amount, currency = 'EUR') {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  const sym = CURRENCY_SYMBOLS[currency] || currency || ''
  const abs = Math.abs(amount)
  const body = abs >= 10000
    ? `${Math.round(amount / 1000)}k`
    : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(amount))
  return `${body} ${sym}`.trim()
}

// A one-line summary of an offer, e.g. "65k € base · 75k € total". Empty string
// when there's nothing to show. `labels` lets callers localize the "base"/"total"
// words (the app is French-primary); English words are the default.
export function summarizeComp(comp, labels = {}) {
  if (!hasCompensation(comp)) return ''
  const baseLabel = labels.base || 'base'
  const totalLabel = labels.total || 'total'
  const cur = comp.currency || 'EUR'
  const base = annualBase(comp)
  const total = totalComp(comp)
  const bits = []
  if (base !== null) bits.push(`${formatMoney(base, cur)} ${baseLabel}`)
  if (total !== null && total !== base) bits.push(`${formatMoney(total, cur)} ${totalLabel}`)
  return bits.join(' · ')
}

// Build comparison rows for the cross-job Offer Comparison view. Keeps only jobs
// that carry real comp numbers, sorted by total compensation descending (nulls
// last). Currency is surfaced per-row — no cross-currency conversion is attempted
// (that would need live FX), so the UI warns when currencies differ.
export function buildComparison(jobs) {
  const rows = (jobs || [])
    .filter(j => hasCompensation(j?.compensation))
    .map(j => {
      const c = j.compensation
      return {
        id: j.id,
        company: j.company,
        position: j.position,
        status: j.status,
        stage: c.stage || null,
        currency: c.currency || 'EUR',
        base: annualBase(c),
        bonus: toNumber(c.bonus),
        equity: toNumber(c.equity),
        total: totalComp(c),
        remotePct: toNumber(c.remotePct),
        location: c.location || j.location || '',
        benefits: c.benefits || '',
      }
    })
  rows.sort((a, b) => {
    if (a.total === b.total) return 0
    if (a.total === null) return 1
    if (b.total === null) return -1
    return b.total - a.total
  })
  return rows
}

// True when the comparison mixes currencies (so totals aren't directly comparable).
export function hasMixedCurrencies(rows) {
  const set = new Set((rows || []).map(r => r.currency))
  return set.size > 1
}
