import { describe, it, expect } from 'vitest'
import {
  clampScore, verdictForScore, normalizeScoreResult,
  jdSourceId, buildScoreSignature, cvKeyFor, extScoreSignature, scorePatchFromExtension,
} from './scoreMatch'

describe('clampScore / verdictForScore', () => {
  it('coerces and clamps to an integer 0-100', () => {
    expect(clampScore(72.6)).toBe(73)
    expect(clampScore('85')).toBe(85)
    expect(clampScore(150)).toBe(100)
    expect(clampScore(-3)).toBe(0)
  })
  it('rejects non-numeric input', () => {
    expect(clampScore(undefined)).toBeNull()
    expect(clampScore(NaN)).toBeNull()
    expect(clampScore('strong')).toBeNull()
  })
  it('derives the verdict from the same bands as the badge colours', () => {
    expect(verdictForScore(80)).toBe('STRONG_MATCH')
    expect(verdictForScore(79)).toBe('GOOD_MATCH')
    expect(verdictForScore(60)).toBe('GOOD_MATCH')
    expect(verdictForScore(45)).toBe('PARTIAL_MATCH')
    expect(verdictForScore(10)).toBe('WEAK_MATCH')
  })
})

describe('normalizeScoreResult', () => {
  it('throws when the model answer has no numeric score (never stores a fake 0)', () => {
    expect(() => normalizeScoreResult({})).toThrow()
    expect(() => normalizeScoreResult({ score: 'n/a' })).toThrow()
  })
  it('ignores the model verdict and derives it from the score', () => {
    const r = normalizeScoreResult({ score: 82, verdict: 'WEAK_MATCH', strengths: ['a', 3, null], gaps: 'x', summary: ' ok ' })
    expect(r).toEqual({ score: 82, verdict: 'STRONG_MATCH', strengths: ['a', '3'], gaps: [], summary: 'ok' })
  })
})

describe('signatures', () => {
  const cv = { id: 'cv1', text: 'cv' }
  it('prefers jobDescription, then description, url, long notes', () => {
    expect(jdSourceId({ jobDescription: 'x', url: 'u' })).toMatch(/^jd:/)
    expect(jdSourceId({ description: 'x', url: 'u' })).toMatch(/^jd:/)
    expect(jdSourceId({ url: 'https://a/b' })).toBe('url:https://a/b')
    expect(jdSourceId({ notes: 'short' })).toBeNull()
    expect(jdSourceId({ notes: 'n'.repeat(50) })).toMatch(/^notes:/)
  })
  it('manual and automatic scoring build the same signature', () => {
    const job = { jobDescription: 'Some JD' }
    expect(buildScoreSignature(cvKeyFor(cv), jdSourceId(job))).toBe('base:cv1|' + jdSourceId(job))
    expect(buildScoreSignature(null, jdSourceId(job))).toBeNull()
  })
  it('extension signatures are tied to the JD only', () => {
    const job = { jobDescription: 'Some JD' }
    expect(extScoreSignature(job)).toBe('ext|' + jdSourceId(job))
    expect(extScoreSignature({})).toBeNull()
  })
})

describe('scorePatchFromExtension', () => {
  it('returns null without a usable score or JD', () => {
    expect(scorePatchFromExtension({ jobDescription: 'x' }, null)).toBeNull()
    expect(scorePatchFromExtension({ jobDescription: 'x' }, { score: 'nope' })).toBeNull()
    expect(scorePatchFromExtension({}, { score: 50 })).toBeNull()
  })
  it('builds a provisional patch for listing scores', () => {
    const job = { jobDescription: 'snippet text' }
    const p = scorePatchFromExtension(job, { score: 71, reason: 'bon fit', source: 'listing' })
    expect(p.score).toBe(71)
    expect(p.scoreSignature).toBe(extScoreSignature(job))
    expect(p.scoreDetails.verdict).toBe('GOOD_MATCH')
    expect(p.scoreDetails.summary).toBe('bon fit')
    expect(p.scoreDetails.provisional).toBe(true)
    expect(p.scoreDetails.source).toBe('listing')
  })
  it('page scores are not provisional', () => {
    const p = scorePatchFromExtension({ jobDescription: 'full jd' }, { score: 90, summary: 's', strengths: ['a'], gaps: ['b'], source: 'page', cvName: 'CV.pdf' })
    expect(p.scoreDetails.provisional).toBe(false)
    expect(p.scoreDetails.cvName).toBe('CV.pdf')
  })
})
