import { describe, it, expect } from 'vitest'
import {
  followUpThresholdDays, lastActivityMs, interviewStartMs, nextInterviewEntry, reviewingSinceMs,
} from './useNotificationScenarios'

const H = 3600 * 1000
const now = new Date('2026-10-01T10:00:00').getTime()
const at = (offsetMs) => new Date(now + offsetMs).toISOString()

describe('followUpThresholdDays — follows the Rappels settings', () => {
  const s = { followUpSentDays: 5, followUpReviewingDays: 8, followUpWaitingDays: 3 }
  it('returns the per-status delay the user configured', () => {
    expect(followUpThresholdDays('sent', s)).toBe(5)
    expect(followUpThresholdDays('reviewing', s)).toBe(8)
    expect(followUpThresholdDays('waiting', s)).toBe(3)
  })
  it('is null for statuses that get no follow-up reminder', () => {
    expect(followUpThresholdDays('interview', s)).toBeNull()
    expect(followUpThresholdDays('rejected', s)).toBeNull()
  })
})

describe('lastActivityMs', () => {
  it('uses the most recent timeline entry, not the application date', () => {
    const job = { date: '2026-08-01', history: [{ date: '2026-08-01' }, { date: '2026-09-25T09:00:00Z' }, { date: '2026-09-10' }] }
    expect(lastActivityMs(job)).toBe(new Date('2026-09-25T09:00:00Z').getTime())
  })
  it('falls back to the application date when there is no dated history', () => {
    expect(lastActivityMs({ date: '2026-08-01', history: [] })).toBe(new Date('2026-08-01').getTime())
  })
})

describe('nextInterviewEntry — the reminder targets the NEXT interview', () => {
  it('skips a past first round and picks the upcoming second round', () => {
    const history = [
      { status: 'interview', date: at(-10 * 24 * H), note: 'Round 1' },
      { status: 'interview', date: at(20 * H), note: 'Round 2' },
    ]
    const next = nextInterviewEntry(history, now)
    expect(next.entry.note).toBe('Round 2')
    expect(Math.round((next.at - now) / H)).toBe(20)
  })
  it('picks the soonest of several upcoming interviews', () => {
    const history = [
      { status: 'interview', date: at(72 * H), note: 'Later' },
      { status: 'interview', date: at(5 * H), note: 'Sooner' },
    ]
    expect(nextInterviewEntry(history, now).entry.note).toBe('Sooner')
  })
  it('returns null when every interview is in the past', () => {
    expect(nextInterviewEntry([{ status: 'interview', date: at(-2 * H) }], now)).toBeNull()
  })
  it('treats a date-only entry as 09:00 local that day, not UTC midnight', () => {
    expect(interviewStartMs({ date: '2026-10-02' })).toBe(new Date('2026-10-02T09:00:00').getTime())
  })
})

describe('reviewingSinceMs — start of the CURRENT reviewing stretch', () => {
  it('ignores an older reviewing period that was followed by another status', () => {
    const history = [
      { status: 'reviewing', date: '2026-08-01' },
      { status: 'interview', date: '2026-08-10' },
      { status: 'reviewing', date: '2026-09-20' },
      { status: 'reviewing', date: '2026-09-25' },
    ]
    expect(reviewingSinceMs(history)).toBe(new Date('2026-09-20').getTime())
  })
  it('is NaN when the latest entry is not reviewing', () => {
    expect(reviewingSinceMs([{ status: 'reviewing', date: '2026-08-01' }, { status: 'rejected', date: '2026-08-05' }])).toBeNaN()
  })
})
