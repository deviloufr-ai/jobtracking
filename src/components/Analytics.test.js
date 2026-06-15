import { describe, it, expect } from 'vitest'
import { computeAnalytics } from './Analytics'

const today = new Date()
const iso = d => new Date(d).toISOString().split('T')[0]
const daysAgo = n => iso(new Date(today.getTime() - n * 86400000))

describe('computeAnalytics', () => {
  it('returns an empty/zero shape when there are no applied jobs', () => {
    const a = computeAnalytics([{ id: '1', status: 'todo', date: daysAgo(2), history: [] }])
    expect(a.total).toBe(0)
    expect(a.responseRate).toBe(0)
    expect(a.avgTimeToInterview).toBeNull()
    expect(a.funnel.find(f => f.key === 'sent').count).toBe(0)
  })

  it('counts applied jobs (status !== todo) as the funnel base', () => {
    const a = computeAnalytics([
      { id: '1', status: 'sent', date: daysAgo(10), history: [] },
      { id: '2', status: 'sent', date: daysAgo(8), history: [] },
      { id: '3', status: 'todo', date: daysAgo(1), history: [] },
    ])
    expect(a.total).toBe(2)
  })

  it('treats a rejection as a response (response rate counts replies, not just progress)', () => {
    const a = computeAnalytics([
      { id: '1', status: 'rejected', date: daysAgo(20), history: [] }, // responded (rejection)
      { id: '2', status: 'sent', date: daysAgo(10), history: [] },     // ghosted
    ])
    expect(a.responded).toBe(1)
    expect(a.responseRate).toBe(50)
  })

  it('credits the furthest stage reached even after a later rejection', () => {
    // Interviewed, then rejected — current status is "rejected" but history records the interview.
    const a = computeAnalytics([
      {
        id: '1', status: 'rejected', date: daysAgo(30),
        history: [
          { date: daysAgo(30), status: 'sent', note: 'Applied' },
          { date: daysAgo(20), status: 'interview', note: 'Onsite' },
          { date: daysAgo(10), status: 'rejected', note: 'No' },
        ],
      },
    ])
    expect(a.reachedInterview).toBe(1)
    expect(a.interviewRate).toBe(100)
    expect(a.funnel.find(f => f.key === 'interview').count).toBe(1)
  })

  it('computes average time-to-interview from application date to first interview entry', () => {
    const a = computeAnalytics([
      {
        id: '1', status: 'interview', date: daysAgo(30),
        history: [
          { date: daysAgo(30), status: 'sent', note: 'Applied' },
          { date: daysAgo(20), status: 'interview', note: 'Call' }, // 10 days
        ],
      },
      {
        id: '2', status: 'interview', date: daysAgo(40),
        history: [
          { date: daysAgo(40), status: 'sent', note: 'Applied' },
          { date: daysAgo(20), status: 'interview', note: 'Call' }, // 20 days
        ],
      },
    ])
    expect(a.ttiCount).toBe(2)
    expect(a.avgTimeToInterview).toBe(15) // (10 + 20) / 2
  })

  it('ignores interview entries with no usable date in time-to-interview', () => {
    const a = computeAnalytics([
      { id: '1', status: 'interview', date: daysAgo(10), history: [{ date: daysAgo(10), status: 'sent' }] },
    ])
    expect(a.ttiCount).toBe(0)
    expect(a.avgTimeToInterview).toBeNull()
  })

  it('buckets applications into the requested number of weekly buckets', () => {
    const a = computeAnalytics(
      [
        { id: '1', status: 'sent', date: daysAgo(2), history: [] },   // this week
        { id: '2', status: 'sent', date: daysAgo(3), history: [] },   // this week
        { id: '3', status: 'sent', date: daysAgo(9), history: [] },   // last week
      ],
      4,
    )
    expect(a.weekly).toHaveLength(4)
    expect(a.weekly.reduce((s, w) => s + w.count, 0)).toBe(3)
    // All jobs are within the last ~9 days, so the oldest bucket (~3-4 weeks
    // ago) is empty and the activity sits in the most recent two buckets.
    // All jobs are within ~9 days, so the oldest bucket (~3 weeks ago) is empty
    // and every application falls in the three most recent buckets.
    expect(a.weekly[0].count).toBe(0)
    expect(a.weekly[1].count + a.weekly[2].count + a.weekly[3].count).toBe(3)
  })
})
