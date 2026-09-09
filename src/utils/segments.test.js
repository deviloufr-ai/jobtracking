import { describe, it, expect } from 'vitest'
import {
  inferSector, locationBucket, salaryBand, computeSegments,
} from './segments'

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().split('T')[0]

describe('inferSector', () => {
  it('infers a specific sector from role/description text', () => {
    expect(inferSector({ company: 'Qonto', position: 'PM', jobDescription: 'neobank for SMEs, payments' })).toBe('fintech')
    expect(inferSector({ company: 'Doctolib', jobDescription: 'healthcare booking for patients' })).toBe('healthtech')
  })

  it('prefers a specific sector over the broad software bucket on a tie', () => {
    // Mentions both "saas" (software) and "fintech" — fintech must win.
    expect(inferSector({ position: 'Product Manager', jobDescription: 'fintech saas platform' })).toBe('fintech')
  })

  it('uses word boundaries so "care" does not match inside "career"', () => {
    expect(inferSector({ position: 'Product Manager', jobDescription: 'grow your career with us' })).toBe('other')
  })

  it('falls back to other when nothing matches', () => {
    expect(inferSector({ company: 'Acme', position: 'Product Manager' })).toBe('other')
    expect(inferSector({})).toBe('other')
  })
})

describe('locationBucket', () => {
  it('detects remote from the location string (FR/EN)', () => {
    expect(locationBucket({ location: 'Remote' }).key).toBe('remote')
    expect(locationBucket({ location: 'Full-remote (France)' }).key).toBe('remote')
    expect(locationBucket({ location: 'Télétravail' }).key).toBe('remote')
  })

  it('detects remote from compensation.remotePct === 100 when no location', () => {
    expect(locationBucket({ compensation: { remotePct: 100 } }).key).toBe('remote')
  })

  it('keeps the first city segment as the label', () => {
    const b = locationBucket({ location: 'Paris, France' })
    expect(b.key).toBe('city:paris')
    expect(b.label).toBe('Paris')
  })

  it('buckets a missing location as unknown', () => {
    expect(locationBucket({}).key).toBe('__unknown__')
  })
})

describe('salaryBand', () => {
  it('bands from compensation base (annualized)', () => {
    expect(salaryBand({ compensation: { base: 55000, basePeriod: 'year' } })).toBe('40-60')
    expect(salaryBand({ compensation: { base: 5000, basePeriod: 'month' } })).toBe('60-80') // 60k/yr
  })

  it('bands from salaryMin/Max midpoint', () => {
    expect(salaryBand({ salaryMin: 90000, salaryMax: 110000 })).toBe('100plus') // midpoint 100k → 100plus
    expect(salaryBand({ salaryMin: 45000 })).toBe('40-60')
  })

  it('reads a bare sub-1000 value as thousands', () => {
    expect(salaryBand({ salaryMin: 45, salaryMax: 55 })).toBe('40-60') // 50k
  })

  it('is unknown with no salary signal', () => {
    expect(salaryBand({})).toBe('__unknown__')
  })
})

describe('computeSegments', () => {
  const jobs = [
    { id: '1', company: 'Qonto', position: 'PM fintech payments', status: 'interview', date: daysAgo(20),
      history: [{ date: daysAgo(20), status: 'sent' }, { date: daysAgo(10), status: 'interview' }] },
    { id: '2', company: 'Swile', position: 'fintech PM', status: 'rejected_ats', date: daysAgo(30),
      history: [{ date: daysAgo(30), status: 'sent' }, { date: daysAgo(25), status: 'rejected_ats' }] },
    { id: '3', company: 'Doctolib', position: 'health PM patient', status: 'sent', date: daysAgo(15),
      history: [{ date: daysAgo(15), status: 'sent' }] },
    { id: '4', company: 'Acme', position: 'PM', status: 'todo', date: daysAgo(2), history: [] }, // not applied
  ]

  it('groups applied jobs by sector with per-segment funnel + rejection metrics', () => {
    const { total, segments } = computeSegments(jobs, 'sector')
    expect(total).toBe(3) // todo excluded

    const fintech = segments.find(s => s.key === 'fintech')
    expect(fintech.count).toBe(2)
    expect(fintech.reachedInterview).toBe(1)
    expect(fintech.interviewRate).toBe(50)
    expect(fintech.rejected).toBe(1)
    expect(fintech.ats).toBe(1)
    expect(fintech.rejectionRate).toBe(50)

    const health = segments.find(s => s.key === 'healthtech')
    expect(health.count).toBe(1)
    expect(health.interviewRate).toBe(0)
  })

  it('sorts by application count with catch-all buckets last', () => {
    const withOther = [
      ...jobs,
      { id: '5', company: 'Acme', position: 'PM', status: 'sent', date: daysAgo(5), history: [{ date: daysAgo(5), status: 'sent' }] },
      { id: '6', company: 'Globex', position: 'PM', status: 'sent', date: daysAgo(5), history: [{ date: daysAgo(5), status: 'sent' }] },
    ]
    const { segments } = computeSegments(withOther, 'sector')
    // fintech (2) leads; "other" (2) is a catch-all and must sink to last despite the tie.
    expect(segments[0].key).toBe('fintech')
    expect(segments[segments.length - 1].key).toBe('other')
  })

  it('returns an empty shape when nothing has been applied to', () => {
    const { total, segments } = computeSegments([{ id: '1', status: 'todo', history: [] }], 'sector')
    expect(total).toBe(0)
    expect(segments).toHaveLength(0)
  })
})
