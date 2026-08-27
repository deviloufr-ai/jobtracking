import { describe, it, expect, beforeEach, vi } from 'vitest'

// useJobs.js transitively imports services/supabase.js, which calls createClient()
// at module load and throws when no credentials are configured (as in CI/tests).
// Stub it so we can exercise the pure business-rule functions in isolation.
vi.mock('../services/supabase', () => ({
  supabase: {},
  isSupabaseConfigured: () => false,
  resolveAuthUserId: () => Promise.resolve(null),
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
  partitionJobsByTombstones,
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

  it('collapses same-company positions that differ only by punctuation/suffix drift', () => {
    const jobs = [
      { id: '1', company: 'Ecole Européenne du Numérique', position: 'Product Builder IA et No Code', status: 'reviewing', date: '2026-06-26', history: [] },
      { id: '2', company: 'Ecole Européenne du Numérique', position: 'Product Builder IA et No-Code - Tech', status: 'reviewing', date: '2026-06-26', history: [] },
      { id: '3', company: 'Figma', position: 'Product Engineer', status: 'todo', date: '2026-01-02', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    expect(result.filter(j => j.company.startsWith('Ecole'))).toHaveLength(1)
  })

  it('collapses same-company positions that differ only by a French gender marker', () => {
    const jobs = [
      { id: '1', company: 'Source.paris', position: 'Chef(fe) de Projet Senior', status: 'rejected', date: '2026-07-31', history: [] },
      { id: '2', company: 'Source.paris', position: 'Chef de Projet Senior', status: 'rejected', date: '2026-07-31', history: [] },
      { id: '3', company: 'Figma', position: 'Product Engineer', status: 'todo', date: '2026-01-02', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    expect(result.filter(j => j.company === 'Source.paris')).toHaveLength(1)
    expect(result.some(j => j.company === 'Figma')).toBe(true)
  })

  it('collapses an abbreviated title into the full one at the same company ("PM" = "Product Manager")', () => {
    const jobs = [
      { id: '1', company: 'Weglot', position: 'Senior Product Manager (H/F) - CDI', status: 'reviewing', date: '2026-08-10',
        history: [
          { date: '2026-08-10', status: 'sent', note: 'Candidature envoyée' },
          { date: '2026-08-12', status: 'reviewing', note: 'Candidature bien reçue, profil en cours d\'examen' },
        ] },
      { id: '2', company: 'Weglot', position: 'Senior PM', status: 'rejected', date: '2026-08-20',
        history: [
          { date: '2026-08-20', status: 'rejected', note: 'Refus explicite après étude de candidature' },
        ] },
      { id: '3', company: 'Figma', position: 'Designer', status: 'todo', date: '2026-08-01', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    expect(result.filter(j => j.company === 'Weglot')).toHaveLength(1)
    expect(result.some(j => j.company === 'Figma')).toBe(true)
  })

  it('keeps genuinely-distinct roles at the same company separate', () => {
    const jobs = [
      { id: '1', company: 'Datadog', position: 'Product Manager Mobile', status: 'sent', date: '2026-06-01', history: [] },
      { id: '2', company: 'Datadog', position: 'Product Manager Web', status: 'sent', date: '2026-06-02', history: [] },
      { id: '3', company: 'Figma', position: 'Designer', status: 'todo', date: '2026-06-03', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    expect(result.filter(j => j.company === 'Datadog')).toHaveLength(2)
  })

  it('merges a late lone-rejection row back into the same closed candidature (not a re-application)', () => {
    const jobs = [
      { id: '1', company: 'Revolut', position: 'Product Owner (Crypto)', status: 'rejected', date: '2026-08-12',
        history: [
          { date: '2026-08-10', status: 'sent', note: 'Candidature envoyée' },
          { date: '2026-08-12', status: 'rejected', note: 'Email de remerciement envoyé' },
        ] },
      { id: '2', company: 'Revolut', position: 'Product Owner (Crypto)', status: 'rejected', date: '2026-08-17',
        history: [
          { date: '2026-08-17', status: 'rejected', note: 'Refus explicite — won\'t be moving forward' },
        ] },
      { id: '3', company: 'Figma', position: 'Designer', status: 'todo', date: '2026-08-01', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    const revolut = result.filter(j => j.company === 'Revolut')
    expect(revolut).toHaveLength(1)
    // Both timelines survive on the single merged candidature.
    expect(revolut[0].history.map(h => h.status)).toEqual(expect.arrayContaining(['sent', 'rejected']))
  })

  it('keeps a genuine re-application (fresh active lead after a closed cycle) separate', () => {
    const jobs = [
      { id: '1', company: 'Nextep HR', position: 'Product Manager', status: 'archived', date: '2026-06-01',
        history: [
          { date: '2026-06-01', status: 'sent', note: 'Candidature envoyée' },
          { date: '2026-06-10', status: 'reviewing', note: 'En cours de revue' },
        ] },
      { id: '2', company: 'Nextep HR', position: 'Product Manager', status: 'todo', date: '2026-08-15',
        history: [
          { date: '2026-08-15', status: 'todo', note: 'Nouvelle offre trouvée' },
        ] },
      { id: '3', company: 'Figma', position: 'Designer', status: 'todo', date: '2026-08-01', history: [] },
    ]
    const result = deduplicateJobs(jobs)
    expect(result.filter(j => j.company.startsWith('Nextep'))).toHaveLength(2)
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

describe('partitionJobsByTombstones (cross-device deletion consumer)', () => {
  const jobs = [
    { id: 'a', company: 'Stripe' },
    { id: 'b', company: 'Figma' },
    { id: 'c', company: 'Notion' },
  ]

  it('removes only jobs whose id is in the tombstone set, keeps the rest', () => {
    const { kept, removed } = partitionJobsByTombstones(jobs, new Set(['b']))
    expect(removed.map(j => j.id)).toEqual(['b'])
    expect(kept.map(j => j.id)).toEqual(['a', 'c'])
  })

  it('accepts a plain array of ids as well as a Set', () => {
    const { removed } = partitionJobsByTombstones(jobs, ['a', 'c'])
    expect(removed.map(j => j.id)).toEqual(['a', 'c'])
  })

  it('is a no-op for an empty tombstone set (nothing removed)', () => {
    const { kept, removed } = partitionJobsByTombstones(jobs, [])
    expect(removed).toEqual([])
    expect(kept).toHaveLength(3)
  })

  it('ignores tombstone ids that match no local job (never removes by inference)', () => {
    const { kept, removed } = partitionJobsByTombstones(jobs, ['does-not-exist'])
    expect(removed).toEqual([])
    expect(kept).toHaveLength(3)
  })

  it('tolerates empty/missing job lists', () => {
    expect(partitionJobsByTombstones([], ['a'])).toEqual({ kept: [], removed: [] })
    expect(partitionJobsByTombstones(undefined, ['a'])).toEqual({ kept: [], removed: [] })
  })
})
