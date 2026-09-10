import { describe, it, expect } from 'vitest'
import { parseSalaryJson, toCompensationPatch, isActiveForSalary } from './salaryFetch'

describe('parseSalaryJson', () => {
  it('parses a bare JSON object', () => {
    const out = parseSalaryJson('{"found": true, "currency": "EUR", "baseMin": 50000, "baseMax": 70000}')
    expect(out.found).toBe(true)
    expect(out.baseMin).toBe(50000)
  })
  it('tolerates code fences and surrounding prose', () => {
    const text = 'Here is the result:\n```json\n{"found": true, "baseMin": 40000, "baseMax": 55000}\n```\nDone.'
    expect(parseSalaryJson(text)).toEqual({ found: true, baseMin: 40000, baseMax: 55000 })
  })
  it('returns null on non-JSON / empty', () => {
    expect(parseSalaryJson('no numbers here')).toBeNull()
    expect(parseSalaryJson('')).toBeNull()
    expect(parseSalaryJson(null)).toBeNull()
  })
})

describe('toCompensationPatch', () => {
  it('builds an expected estimate with the range midpoint as base', () => {
    const patch = toCompensationPatch({ found: true, currency: 'EUR', baseMin: 50000, baseMax: 70000, source: 'Glassdoor', confidence: 'medium' })
    expect(patch.base).toBe(60000)
    expect(patch.baseMin).toBe(50000)
    expect(patch.baseMax).toBe(70000)
    expect(patch.stage).toBe('expected')
    expect(patch.estimated).toBe(true)
    expect(patch.source).toBe('Glassdoor')
    expect(patch.confidence).toBe('medium')
    expect(patch.basePeriod).toBe('year')
  })
  it('returns null when nothing credible was found', () => {
    expect(toCompensationPatch({ found: false })).toBeNull()
    expect(toCompensationPatch(null)).toBeNull()
    expect(toCompensationPatch({ found: true, baseMin: 0, baseMax: 0 })).toBeNull()
  })
  it('handles a single-sided range and defaults currency to EUR', () => {
    const patch = toCompensationPatch({ found: true, baseMax: 80000 })
    expect(patch.base).toBe(80000)
    expect(patch.baseMax).toBe(80000)
    expect(patch.baseMin).toBeUndefined()
    expect(patch.currency).toBe('EUR')
  })
  it('preserves an existing stage/location and rejects an unknown currency', () => {
    const patch = toCompensationPatch(
      { found: true, currency: 'XXX', baseMin: 60000, baseMax: 60000 },
      { stage: 'offered', location: 'Paris', currency: 'USD' }
    )
    expect(patch.stage).toBe('offered')
    expect(patch.location).toBe('Paris')
    expect(patch.currency).toBe('USD') // falls back to existing when parsed currency is invalid
  })
})

describe('isActiveForSalary', () => {
  it('treats open pipeline statuses as active', () => {
    for (const status of ['todo', 'sent', 'reviewing', 'interview', 'waiting', 'offer']) {
      expect(isActiveForSalary({ status })).toBe(true)
    }
  })
  it('excludes closed / dead statuses', () => {
    for (const status of ['archived', 'rejected', 'rejected_ats', 'cancelled']) {
      expect(isActiveForSalary({ status })).toBe(false)
    }
  })
  it('is falsy for a missing job', () => {
    expect(isActiveForSalary(null)).toBe(false)
  })
})
