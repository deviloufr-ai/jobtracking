import { describe, it, expect } from 'vitest'
import {
  sentJobs, hasResponse, maxStageReached, responseRate, interviewRate,
  applicationDate, mondayOf,
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
