import { describe, it, expect, beforeEach, vi } from 'vitest'

// useJobs.js transitively imports services/supabase.js, which calls createClient()
// at module load and throws when no credentials are configured (as in CI/tests).
// Stub it so we can exercise the pure business-rule functions in isolation.
vi.mock('../services/supabase', () => ({
  supabase: {},
  isSupabaseConfigured: () => false,
}))

import {
  getStatus,
  getStatusLabel,
  STATUSES,
  isAtsRejection,
  isEnriched,
  needsEnrichment,
  normalizeNoteForKey,
  historyEntryKey,
  mergeNotes,
  findDuplicateJob,
  deduplicateJobs,
  sortJobHistory,
  markHistoryEntryAsDeleted,
  isDeletedHistoryEntry,
  filterDeletedHistory,
} from './useJobs'

const daysAgo = n => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

describe('getStatus / getStatusLabel', () => {
  it('returns the matching status object', () => {
    expect(getStatus('interview').key).toBe('interview')
    expect(getStatus('offer').label).toBe('Offer received')
  })

  it('falls back to the first status for unknown keys', () => {
    expect(getStatus('does-not-exist')).toBe(STATUSES[0])
  })

  it('uses the translation when present, and falls back to the default label when the translator returns nothing', () => {
    expect(getStatusLabel('sent', k => ({ 'status.sent': 'Envoyé' }[k]))).toBe('Envoyé')
    // When the translator returns a falsy value, the hard-coded label is used.
    expect(getStatusLabel('sent', () => undefined)).toBe('Sent')
  })
})

describe('isAtsRejection', () => {
  it('detects rejection by ATS sender domain', () => {
    expect(isAtsRejection('thanks for applying', 'no-reply@greenhouse.io')).toBe(true)
    expect(isAtsRejection('', 'jobs@ashbyhq.com')).toBe(true)
  })

  it('detects rejection by keyword in the notes (case-insensitive)', () => {
    expect(isAtsRejection('We regret to inform you...')).toBe(true)
    expect(isAtsRejection('not moving forward with your application')).toBe(true)
    expect(isAtsRejection('Nous avons le regret de...')).toBe(true)
  })

  it('returns false for neutral content from a non-ATS sender', () => {
    expect(isAtsRejection('Looking forward to our interview', 'recruiter@stripe.com')).toBe(false)
  })
})

describe('isEnriched / needsEnrichment', () => {
  it('treats jobs without enrichedAt as not enriched', () => {
    expect(isEnriched({})).toBe(false)
    expect(needsEnrichment({})).toBe(true)
  })

  it('considers a recently enriched job as enriched (within 30-day TTL)', () => {
    const job = { enrichedAt: daysAgo(5) }
    expect(isEnriched(job)).toBe(true)
    expect(needsEnrichment(job)).toBe(false)
  })

  it('considers a stale enrichment (older than TTL) as needing enrichment', () => {
    const job = { enrichedAt: daysAgo(40) }
    expect(isEnriched(job)).toBe(false)
    expect(needsEnrichment(job)).toBe(true)
  })
})

describe('normalizeNoteForKey', () => {
  it('strips trailing checkmark, lowercases, and collapses whitespace', () => {
    expect(normalizeNoteForKey('Interview   scheduled ✓')).toBe('interview scheduled')
  })

  it('handles empty/undefined input', () => {
    expect(normalizeNoteForKey()).toBe('')
    expect(normalizeNoteForKey('')).toBe('')
  })

  it('truncates to 120 chars', () => {
    expect(normalizeNoteForKey('a'.repeat(200)).length).toBe(120)
  })
})

describe('historyEntryKey', () => {
  it('prefers gmailId when present', () => {
    expect(historyEntryKey({ gmailId: 'abc', date: '2026-01-01', note: 'x' })).toBe('gmail:abc')
  })

  it('builds a composite key from date, status and normalized note otherwise', () => {
    expect(historyEntryKey({ date: '2026-01-01', status: 'sent', note: 'Applied ✓' }))
      .toBe('2026-01-01||sent||applied')
  })

  it('is stable across cosmetic note differences (whitespace/case/checkmark)', () => {
    const a = historyEntryKey({ date: '2026-01-01', status: 'sent', note: 'Applied  online' })
    const b = historyEntryKey({ date: '2026-01-01', status: 'sent', note: 'applied online ✓' })
    expect(a).toBe(b)
  })

  it('returns empty string for falsy entry', () => {
    expect(historyEntryKey(null)).toBe('')
  })
})

describe('mergeNotes', () => {
  it('joins distinct segments with the pipe separator', () => {
    expect(mergeNotes('Applied', 'Phone screen')).toBe('Applied | Phone screen')
  })

  it('de-duplicates segments case-insensitively', () => {
    expect(mergeNotes('Applied | Phone screen', 'applied')).toBe('Applied | Phone screen')
  })

  it('ignores empty/falsy inputs', () => {
    expect(mergeNotes('', null, undefined, 'Only one')).toBe('Only one')
  })
})

describe('findDuplicateJob', () => {
  const jobs = [
    { id: '1', company: 'Stripe Inc.', position: 'Backend Engineer' },
    { id: '2', company: 'Figma', position: 'unknown' },
  ]

  it('matches on normalized company + exact position', () => {
    // "Stripe Inc." normalizes to "stripe", matching "Stripe"
    expect(findDuplicateJob(jobs, 'Stripe', 'Backend Engineer')?.id).toBe('1')
  })

  it('matches two generic positions at the same company', () => {
    expect(findDuplicateJob(jobs, 'Figma', 'unknown position')?.id).toBe('2')
  })

  it('returns null when nothing matches', () => {
    expect(findDuplicateJob(jobs, 'Notion', 'Designer')).toBeNull()
  })
})

describe('deduplicateJobs', () => {
  it('returns the input unchanged when there are 2 or fewer jobs (early exit)', () => {
    const jobs = [{ id: '1', company: 'A', position: 'X' }]
    expect(deduplicateJobs(jobs)).toBe(jobs)
  })

  it('preserves distinct jobs', () => {
    const jobs = [
      { id: '1', company: 'Stripe', position: 'Backend Engineer', status: 'sent', date: '2026-01-01', history: [] },
      { id: '2', company: 'Figma', position: 'Product Engineer', status: 'sent', date: '2026-01-02', history: [] },
      { id: '3', company: 'Notion', position: 'Frontend Engineer', status: 'todo', date: '2026-01-03', history: [] },
    ]
    expect(deduplicateJobs(jobs)).toHaveLength(3)
  })

  it('collapses two entries for the same company + position', () => {
    const jobs = [
      { id: '1', company: 'Stripe', position: 'Backend Engineer', status: 'sent', date: '2026-01-01', history: [] },
      { id: '2', company: 'Stripe', position: 'Backend Engineer', status: 'reviewing', date: '2026-01-05', history: [] },
      { id: '3', company: 'Figma', position: 'Product Engineer', status: 'todo', date: '2026-01-02', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    expect(result.length).toBeLessThan(jobs.length)
    expect(result.filter(j => j.company === 'Stripe')).toHaveLength(1)
    expect(result.some(j => j.company === 'Figma')).toBe(true)
  })
})

describe('sortJobHistory', () => {
  it('sorts history chronologically by date', () => {
    const job = { history: [
      { date: '2026-03-01', note: 'c' },
      { date: '2026-01-01', note: 'a' },
      { date: '2026-02-01', note: 'b' },
    ] }
    expect(sortJobHistory(job).history.map(h => h.note)).toEqual(['a', 'b', 'c'])
  })

  it('returns the same reference when already sorted (no needless copy)', () => {
    const job = { history: [{ date: '2026-01-01' }, { date: '2026-02-01' }] }
    expect(sortJobHistory(job)).toBe(job)
  })

  it('returns the job untouched when there is no history', () => {
    const job = { history: [] }
    expect(sortJobHistory(job)).toBe(job)
  })
})

describe('deleted-history tombstones (localStorage-backed)', () => {
  beforeEach(() => localStorage.clear())

  it('records and recognizes a deleted entry by its canonical key', () => {
    const entry = { date: '2026-01-01', status: 'sent', note: 'Applied' }
    expect(isDeletedHistoryEntry('job1', entry)).toBe(false)
    markHistoryEntryAsDeleted('job1', entry)
    expect(isDeletedHistoryEntry('job1', entry)).toBe(true)
  })

  it('matches tombstones across cosmetic note differences', () => {
    markHistoryEntryAsDeleted('job1', { date: '2026-01-01', status: 'sent', note: 'Applied online' })
    // Same canonical key (checkmark + case + spacing differ) → still considered deleted
    expect(isDeletedHistoryEntry('job1', { date: '2026-01-01', status: 'sent', note: 'applied  online ✓' })).toBe(true)
  })

  it('is scoped per jobId', () => {
    const entry = { date: '2026-01-01', status: 'sent', note: 'Applied' }
    markHistoryEntryAsDeleted('job1', entry)
    expect(isDeletedHistoryEntry('job2', entry)).toBe(false)
  })

  it('filterDeletedHistory drops tombstoned entries only', () => {
    const keep = { date: '2026-02-01', status: 'interview', note: 'Onsite' }
    const drop = { date: '2026-01-01', status: 'sent', note: 'Applied' }
    markHistoryEntryAsDeleted('job1', drop)
    expect(filterDeletedHistory('job1', [keep, drop])).toEqual([keep])
  })
})
