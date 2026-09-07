import { describe, it, expect } from 'vitest'
import {
  toNumber, annualBase, totalComp, hasCompensation, formatMoney,
  summarizeComp, buildComparison, hasMixedCurrencies,
} from './compensation'

describe('toNumber', () => {
  it('parses plain numbers and strings', () => {
    expect(toNumber(65000)).toBe(65000)
    expect(toNumber('65000')).toBe(65000)
  })
  it('handles French formatting, currency glyphs and k suffix', () => {
    expect(toNumber('65 000 €')).toBe(65000)
    expect(toNumber('65,5k')).toBe(65500)
    expect(toNumber('65k')).toBe(65000)
  })
  it('disambiguates comma/dot as decimal vs thousands (FR and EN)', () => {
    expect(toNumber('65,000')).toBe(65000)   // EN thousands, not 65
    expect(toNumber('1,234.56')).toBe(1234.56) // EN
    expect(toNumber('1.234,56')).toBe(1234.56) // FR
    expect(toNumber('65,5')).toBe(65.5)      // FR decimal
    expect(toNumber('1,500,000')).toBe(1500000)
  })
  it('returns null for empty / invalid input', () => {
    expect(toNumber('')).toBeNull()
    expect(toNumber(null)).toBeNull()
    expect(toNumber('abc')).toBeNull()
  })
})

describe('annualBase', () => {
  it('passes yearly base through', () => {
    expect(annualBase({ base: 60000, basePeriod: 'year' })).toBe(60000)
  })
  it('annualizes a monthly base', () => {
    expect(annualBase({ base: 5000, basePeriod: 'month' })).toBe(60000)
  })
  it('is null when no base is set', () => {
    expect(annualBase({ bonus: 5000 })).toBeNull()
    expect(annualBase(null)).toBeNull()
  })
})

describe('totalComp', () => {
  it('sums base, bonus and equity', () => {
    expect(totalComp({ base: 60000, bonus: 10000, equity: 5000 })).toBe(75000)
  })
  it('totals a base-only offer', () => {
    expect(totalComp({ base: 60000 })).toBe(60000)
  })
  it('is null when nothing numeric is set', () => {
    expect(totalComp({ benefits: 'car', notes: 'nice' })).toBeNull()
    expect(totalComp(null)).toBeNull()
  })
})

describe('hasCompensation', () => {
  it('is true when any numeric field is present', () => {
    expect(hasCompensation({ base: 60000 })).toBe(true)
    expect(hasCompensation({ equity: 1000 })).toBe(true)
  })
  it('is false for empty / text-only records', () => {
    expect(hasCompensation({})).toBe(false)
    expect(hasCompensation({ benefits: 'car' })).toBe(false)
    expect(hasCompensation(null)).toBe(false)
  })
})

describe('formatMoney', () => {
  it('rounds to k above 10000', () => {
    expect(formatMoney(65000, 'EUR')).toBe('65k €')
  })
  it('shows the full amount below 10000', () => {
    // Intl formats fr-FR thousands with a narrow no-break space; normalize
    // whitespace so the assertion is glyph-agnostic.
    expect(formatMoney(8000, 'USD').replace(/\s/g, ' ')).toBe('8 000 $')
  })
  it('renders a placeholder for null', () => {
    expect(formatMoney(null)).toBe('—')
  })
})

describe('summarizeComp', () => {
  it('shows base and total when they differ', () => {
    expect(summarizeComp({ base: 60000, bonus: 10000, currency: 'EUR' }))
      .toBe('60k € base · 70k € total')
  })
  it('collapses to a single figure when base === total', () => {
    expect(summarizeComp({ base: 60000, currency: 'EUR' })).toBe('60k € base')
  })
  it('is empty when there is nothing numeric', () => {
    expect(summarizeComp({ benefits: 'car' })).toBe('')
  })
})

describe('buildComparison', () => {
  const jobs = [
    { id: 'a', company: 'A', position: 'PM', status: 'offer', compensation: { base: 60000, bonus: 10000, currency: 'EUR' } },
    { id: 'b', company: 'B', position: 'PM', status: 'offer', compensation: { base: 80000, currency: 'EUR' } },
    { id: 'c', company: 'C', position: 'PM', status: 'interview', compensation: { benefits: 'car' } }, // no numbers → excluded
    { id: 'd', company: 'D', position: 'PM', status: 'todo' }, // no comp → excluded
  ]
  it('keeps only jobs with numeric comp, sorted by total desc', () => {
    const rows = buildComparison(jobs)
    expect(rows.map(r => r.id)).toEqual(['b', 'a'])
    expect(rows[0].total).toBe(80000)
    expect(rows[1].total).toBe(70000)
  })
  it('tolerates empty input', () => {
    expect(buildComparison([])).toEqual([])
    expect(buildComparison(undefined)).toEqual([])
  })
})

describe('hasMixedCurrencies', () => {
  it('detects differing currencies', () => {
    expect(hasMixedCurrencies([{ currency: 'EUR' }, { currency: 'USD' }])).toBe(true)
  })
  it('is false for a single currency', () => {
    expect(hasMixedCurrencies([{ currency: 'EUR' }, { currency: 'EUR' }])).toBe(false)
  })
})
