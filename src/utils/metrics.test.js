import { describe, it, expect } from 'vitest'
import {
  sentJobs, hasResponse, maxStageReached, responseRate, interviewRate,
  applicationDate, mondayOf, STAGE_RANK, rejectionBreakdown,
} from './metrics'

const iso = d => new Date(d).toISOString().split('T')[0]
const daysAgo = n => iso(new Date(Date.now() - n * 86400000))

describe('sentJobs', () => {
  it('excludes only todo jobs (archived still counts as sent)', () => {
    const jobs = [
      { id: '1', status: 'todo' },
      { id: '2', status: 'sent' },
      { id: '3', status: 'archived' },
    ]
    expect(sentJobs(jobs).map(j => j.id)).toEqual(['2', '3'])
  })
  it('tolerates empty / missing input', () => {
    expect(sentJobs([])).toEqual([])
    expect(sentJobs(undefined)).toEqual([])
  })
})

describe('hasResponse', () => {
  it('counts a rejection as a response', () => {
    expect(hasResponse({ status: 'rejected', history: [] })).toBe(true)
  })
  it('is false for a still-silent sent application', () => {
    expect(hasResponse({ status: 'sent', history: [] })).toBe(false)
  })
  it('credits a reply recorded in history even after a later rejection', () => {
    const job = { status: 'rejected', history: [{ status: 'interview' }, { status: 'rejected' }] }
    expect(hasResponse(job)).toBe(true)
    expect(maxStageReached(job)).toBe(3)
  })
})

describe('responseRate — the single source of truth', () => {
  it('is 0 when nothing was sent', () => {
    expect(responseRate([{ status: 'todo' }])).toBe(0)
  })
  it('replies ÷ sent, ignoring todo in the denominator', () => {
    const jobs = [
      { status: 'rejected', history: [] }, // responded
      { status: 'sent', history: [] },     // ghosted
      { status: 'todo', history: [] },     // not sent — excluded
    ]
    expect(responseRate(jobs)).toBe(50)
  })
})

describe('interviewRate', () => {
  it('counts jobs that reached interview ÷ sent', () => {
    const jobs = [
      { status: 'rejected', history: [{ status: 'interview' }] }, // reached interview
      { status: 'sent', history: [] },
    ]
    expect(interviewRate(jobs)).toBe(50)
  })
})

describe('date helpers', () => {
  it('applicationDate is the earliest known date', () => {
    const job = { date: daysAgo(5), history: [{ date: daysAgo(10) }, { date: daysAgo(2) }] }
    expect(iso(applicationDate(job))).toBe(daysAgo(10))
  })
  it('mondayOf returns the Monday of the ISO week', () => {
    // 2026-08-05 is a Wednesday → Monday is 2026-08-03. Compare local date parts
    // (mondayOf returns a local-midnight Date; toISOString would shift a day in UTC+).
    const m = mondayOf(new Date('2026-08-05T12:00:00'))
    expect(m.getDay()).toBe(1)   // Monday
    expect(m.getDate()).toBe(3)
    expect(m.getMonth()).toBe(7) // August (0-indexed)
  })
})

describe('done (completed interview) is not counted as an offer', () => {
  it('ranks done at the interview level, below offer', () => {
    expect(STAGE_RANK.done).toBe(STAGE_RANK.interview)
    expect(STAGE_RANK.done).toBeLessThan(STAGE_RANK.offer)
  })
  it('a completed interview reaches interview (>=3) but NOT offer (>=4)', () => {
    // Past interview auto-converts to status "done" across the app.
    const doneJob = { status: 'done', history: [{ status: 'sent', date: '2026-01-01' }, { status: 'done', date: '2026-01-05' }] }
    expect(maxStageReached(doneJob)).toBe(3)
    expect(maxStageReached(doneJob) >= 3).toBe(true)  // counts as an interview
    expect(maxStageReached(doneJob) >= 4).toBe(false) // does NOT count as an offer
  })
  it('a real offer still reaches the offer stage', () => {
    const offerJob = { status: 'offer', history: [{ status: 'interview', date: '2026-01-01' }, { status: 'offer', date: '2026-01-10' }] }
    expect(maxStageReached(offerJob) >= 4).toBe(true)
  })
  it('interviewRate counts completed interviews; a done-only pipeline yields 0 offers at >=4', () => {
    const jobs = [
      { status: 'done', history: [{ status: 'sent', date: '2026-01-01' }, { status: 'done', date: '2026-01-05' }] },
      { status: 'sent', history: [{ status: 'sent', date: '2026-01-02' }] },
    ]
    expect(interviewRate(jobs)).toBe(50)                                   // 1 of 2 reached interview
    expect(jobs.filter(j => maxStageReached(j) >= 4).length).toBe(0)       // 0 offers
  })
})

describe('rejectionBreakdown', () => {
  const jobs = [
    // auto-rejected before any reply (ATS)
    { status: 'rejected_ats', source: 'linkedin', history: [{ status: 'sent', date: '2026-01-01' }, { status: 'rejected_ats', date: '2026-01-02' }] },
    // human rejection before reply
    { status: 'rejected', source: 'indeed', history: [{ status: 'sent', date: '2026-01-01' }, { status: 'rejected', date: '2026-01-10' }] },
    // rejected after a screen (reviewing reached)
    { status: 'rejected', source: 'linkedin', history: [{ status: 'sent', date: '2026-01-01' }, { status: 'reviewing', date: '2026-01-03' }, { status: 'rejected', date: '2026-01-09' }] },
    // rejected after an interview
    { status: 'rejected', source: 'apec', history: [{ status: 'sent', date: '2026-01-01' }, { status: 'interview', date: '2026-01-05' }, { status: 'rejected', date: '2026-01-12' }] },
    // auto-archived old rejection — signal only in history
    { status: 'archived', source: 'indeed', history: [{ status: 'sent', date: '2025-01-01' }, { status: 'rejected', date: '2025-02-01' }] },
    // candidate-cancelled — NOT an employer rejection
    { status: 'cancelled', source: 'linkedin', history: [{ status: 'sent', date: '2026-01-01' }] },
    // still active — not rejected
    { status: 'interview', source: 'apec', history: [{ status: 'interview', date: '2026-01-06' }] },
  ]
  const r = rejectionBreakdown(jobs)

  it('counts only employer rejections (incl. archived-after-rejection, excl. cancelled/active)', () => {
    expect(r.total).toBe(5)
  })
  it('buckets by furthest stage reached before the no', () => {
    expect(r.byStage).toEqual({ noResponse: 3, afterScreen: 1, afterInterview: 1 })
  })
  it('splits ATS auto-rejections from human ones', () => {
    expect(r.byType).toEqual({ ats: 1, human: 4 })
  })
  it('tallies rejections by source, most first', () => {
    expect(r.bySource[0]).toEqual({ source: 'linkedin', count: 2 })
    expect(r.bySource.find(s => s.source === 'indeed').count).toBe(2)
  })
})
