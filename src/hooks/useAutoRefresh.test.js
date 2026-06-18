import { describe, it, expect, vi } from 'vitest'

// useAutoRefresh transitively imports useJobs → services/supabase, which throws
// at module load without credentials. Stub it (mirrors useJobs.test.js).
vi.mock('../services/supabase', () => ({
  supabase: {},
  isSupabaseConfigured: () => false,
  resolveAuthUserId: async () => null,
}))

import { filterEmailsBeforeParse } from './useAutoRefresh'

const daysAgo = n => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

// A job whose only contact is the recruiter jane@acme.com, last email 10 days ago.
const acmeJob = (status = 'reviewing') => ({
  company: 'Acme', position: 'PM', status,
  history: [
    { date: daysAgo(20), status: 'sent', from: 'jane@acme.com', source: 'email', gmailId: 'g-old' },
    { date: daysAgo(10), status: 'reviewing', from: 'Jane <jane@acme.com>', source: 'email', gmailId: 'g-mid' },
  ],
})

describe('filterEmailsBeforeParse', () => {
  it('keeps everything when there are no existing jobs', () => {
    const emails = [{ id: 'a', from: 'x@y.com', date: daysAgo(1) }]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [])
    expect(kept).toHaveLength(1)
    expect(reasons).toEqual({ alreadyImported: 0, closed: 0, older: 0 })
  })

  it('Layer 0: drops emails whose gmailId is already imported', () => {
    const emails = [
      { id: 'g-mid', from: 'jane@acme.com', date: daysAgo(10) }, // already imported
      { id: 'g-new', from: 'jane@acme.com', date: daysAgo(1) },  // new
    ]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [acmeJob()])
    expect(kept.map(e => e.id)).toEqual(['g-new'])
    expect(reasons.alreadyImported).toBe(1)
  })

  it('Layer 1: drops new emails from the sender of a refused candidature', () => {
    const emails = [{ id: 'g-new', from: 'Jane <jane@acme.com>', date: daysAgo(1) }]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [acmeJob('rejected')])
    expect(kept).toHaveLength(0)
    expect(reasons.closed).toBe(1)
  })

  it('Layer 1: also applies to rejected_ats', () => {
    const emails = [{ id: 'g-new', from: 'jane@acme.com', date: daysAgo(1) }]
    const { reasons } = filterEmailsBeforeParse(emails, [acmeJob('rejected_ats')])
    expect(reasons.closed).toBe(1)
  })

  it('Layer 2: drops emails older than the job last inbound event, keeps newer ones', () => {
    const emails = [
      { id: 'g-stale', from: 'jane@acme.com', date: daysAgo(15) }, // older than last (10d)
      { id: 'g-fresh', from: 'jane@acme.com', date: daysAgo(2) },  // newer
    ]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [acmeJob('reviewing')])
    expect(kept.map(e => e.id)).toEqual(['g-fresh'])
    expect(reasons.older).toBe(1)
  })

  it('never skips by sender when the sender is shared (job board / ATS)', () => {
    const job = {
      company: 'Acme', position: 'PM', status: 'rejected',
      history: [{ date: daysAgo(10), status: 'rejected', from: 'no-reply@greenhouse.io', source: 'email', gmailId: 'g1' }],
    }
    const emails = [{ id: 'g-new', from: 'no-reply@greenhouse.io', date: daysAgo(1) }]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [job])
    expect(kept).toHaveLength(1) // shared sender → never skipped by status/date
    expect(reasons.closed).toBe(0)
  })

  it('never skips by sender when the same address maps to more than one job', () => {
    const shared = from => ({
      company: 'X', position: 'P', status: 'rejected',
      history: [{ date: daysAgo(10), from, source: 'email', gmailId: Math.random().toString() }],
    })
    const jobs = [shared('rh@cabinet-recrutement.fr'), shared('rh@cabinet-recrutement.fr')]
    const emails = [{ id: 'new', from: 'rh@cabinet-recrutement.fr', date: daysAgo(1) }]
    const { kept, reasons } = filterEmailsBeforeParse(emails, jobs)
    expect(kept).toHaveLength(1) // ambiguous → not skipped
    expect(reasons.closed).toBe(0)
  })

  it('does not anchor the date rule on future calendar events', () => {
    const job = {
      company: 'Acme', position: 'PM', status: 'reviewing',
      history: [
        { date: daysAgo(10), status: 'reviewing', from: 'jane@acme.com', source: 'email', gmailId: 'g-mid' },
        { date: daysAgo(-5), status: 'interview', source: 'calendar' }, // 5 days in the FUTURE
      ],
    }
    const emails = [{ id: 'g-new', from: 'jane@acme.com', date: daysAgo(2) }] // newer than last email, older than calendar
    const { kept } = filterEmailsBeforeParse(emails, [job])
    expect(kept.map(e => e.id)).toEqual(['g-new']) // not suppressed by the future calendar entry
  })

  it('passes through emails from unknown senders (potential new candidatures)', () => {
    const emails = [{ id: 'g-new', from: 'recruiter@newco.com', date: daysAgo(1) }]
    const { kept } = filterEmailsBeforeParse(emails, [acmeJob('rejected')])
    expect(kept.map(e => e.id)).toEqual(['g-new'])
  })
})
