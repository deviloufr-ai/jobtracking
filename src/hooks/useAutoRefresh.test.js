import { describe, it, expect, vi } from 'vitest'

// useAutoRefresh transitively imports useJobs → services/supabase, which throws
// at module load without credentials. Stub it (mirrors useJobs.test.js).
vi.mock('../services/supabase', () => ({
  supabase: {},
  isSupabaseConfigured: () => false,
  resolveAuthUserId: async () => null,
}))

import { filterEmailsBeforeParse, historyDedupKeys, isNewHistoryEntry } from './useAutoRefresh'

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

  it('Layer 1: only archived candidatures are treated as closed', () => {
    const emails = [{ id: 'g-new', from: 'jane@acme.com', date: daysAgo(1) }]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [acmeJob('archived')])
    expect(kept).toHaveLength(0)
    expect(reasons.closed).toBe(1)
  })

  it('Layer 1: rejected / rejected_ats senders pass through (refusal mail can attach as history)', () => {
    // A refusal email to a still-visible rejected candidature must reach the parser
    // so it can be added as a history entry (feature: refusal-as-history). Only
    // `archived` short-circuits as closed.
    for (const status of ['rejected', 'rejected_ats']) {
      const emails = [{ id: 'g-new', from: 'Jane <jane@acme.com>', date: daysAgo(1) }]
      const { kept, reasons } = filterEmailsBeforeParse(emails, [acmeJob(status)])
      expect(kept).toHaveLength(1)
      expect(reasons.closed).toBe(0)
    }
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

  it('treats *.teamtailor-mail.com as a shared multi-tenant ATS domain (never anchors a closed-skip)', () => {
    // Teamtailor sends EVERY customer's candidate mail from <tenant>.teamtailor-mail.com,
    // so no-reply@epicompany.teamtailor-mail.com is shared infra, not a company address.
    // ATS_DOMAINS listed only teamtailor.com, so isSharedSenderDomain missed it: an
    // ARCHIVED Epi Company application (a prior rejected role) claimed that sender and
    // swallowed fresh Epi mail — including the position-bearing "Complete the application
    // for Senior Product Manager…" — as "closed-candidature", so the re-application never
    // reached Claude and the active "À faire" job never updated.
    const archivedEpi = {
      company: 'Epi Company', position: 'Product Manager - Wero App', status: 'archived',
      history: [
        { date: daysAgo(60), status: 'reviewing', from: '"Rébecca - Epi Company" <rebecca@epicompany.teamtailor-mail.com>', source: 'email', gmailId: 'g-old' },
        { date: daysAgo(40), status: 'reviewing', from: 'Epi Company <no-reply@epicompany.teamtailor-mail.com>', source: 'email', gmailId: 'g-old2' },
      ],
    }
    const emails = [{ id: 'g-new', from: 'Epi Company <no-reply@epicompany.teamtailor-mail.com>', date: daysAgo(1) }]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [archivedEpi])
    expect(kept.map(e => e.id)).toEqual(['g-new']) // shared ATS sender → not skipped as closed
    expect(reasons.closed).toBe(0)
  })
})

describe('historyDedupKeys / isNewHistoryEntry', () => {
  // Regression: a stored note merged by combineTopicNotes uses the ' · ' separator;
  // a stored note merged by mergeNotes uses ' | '. The re-import dedup must expand
  // BOTH so a freshly-parsed individual email matches its merged stored form.
  // Splitting on only one separator re-imported the entry every refresh, firing a
  // phantom "X nouvelle entrée dans l'historique" notification with nothing new
  // visible in the timeline.

  it('expands a stored note merged with the " · " separator', () => {
    const stored = [{ date: '2026-06-29', note: 'Email reçu · Relance envoyée' }]
    const keys = historyDedupKeys(stored)
    // Each individual part is recoverable, so neither re-parsed email looks new.
    expect(isNewHistoryEntry(keys, { date: '2026-06-29', note: 'Email reçu' })).toBe(false)
    expect(isNewHistoryEntry(keys, { date: '2026-06-29', note: 'Relance envoyée' })).toBe(false)
  })

  it('expands a stored note merged with the " | " separator', () => {
    const stored = [{ date: '2026-06-29', note: 'Email reçu | Relance envoyée' }]
    const keys = historyDedupKeys(stored)
    expect(isNewHistoryEntry(keys, { date: '2026-06-29', note: 'Email reçu' })).toBe(false)
    expect(isNewHistoryEntry(keys, { date: '2026-06-29', note: 'Relance envoyée' })).toBe(false)
  })

  it('treats a genuinely new note on the same date as new', () => {
    const keys = historyDedupKeys([{ date: '2026-06-29', note: 'Email reçu · Relance envoyée' }])
    expect(isNewHistoryEntry(keys, { date: '2026-06-29', note: 'Entretien proposé' })).toBe(true)
  })

  it('treats the same note on a different date as new', () => {
    const keys = historyDedupKeys([{ date: '2026-06-29', note: 'Email reçu' }])
    expect(isNewHistoryEntry(keys, { date: '2026-06-30', note: 'Email reçu' })).toBe(true)
  })

  it('is whitespace-insensitive (matches normNote normalization)', () => {
    const keys = historyDedupKeys([{ date: '2026-06-29', note: 'Email   reçu' }])
    expect(isNewHistoryEntry(keys, { date: '2026-06-29', note: ' Email reçu ' })).toBe(false)
  })

  it('handles empty / missing history and notes without throwing', () => {
    expect(historyDedupKeys(undefined).size).toBe(0)
    expect(historyDedupKeys([{ date: '2026-06-29', gmailId: undefined }]).size).toBeGreaterThanOrEqual(1) // empty note → at least the text key
    expect(isNewHistoryEntry(new Set(), { date: '2026-06-29', note: 'x' })).toBe(true)
  })

  // Regression: the phantom "1 nouvelle entrée" loop on eXalt Flow. A re-fetched
  // email whose note text drifted (or whose date got re-stamped) looked new to the
  // old text-only key, got re-added every refresh, then collapsed by the canonical
  // (gmailId) dedup in reprocessJobs — a notification with nothing new in the
  // timeline. Keying on the Gmail id makes the same email resolve regardless of note.
  it('matches a re-parsed email by gmailId even when its note text drifted', () => {
    const keys = historyDedupKeys([
      { date: '2026-08-25', status: 'waiting', note: 'Candidature en cours d\'examen', gmailId: 'g-exalt-1' },
    ])
    // Same email (same id), Claude re-phrased the note and re-stamped the day.
    expect(isNewHistoryEntry(keys, { date: '2026-08-26', status: 'reviewing', note: 'Votre candidature est étudiée', gmailId: 'g-exalt-1' })).toBe(false)
  })

  it('recognizes an email whose id survives only in a merged entry\'s gmailIds array', () => {
    // mergeTopicGroup drops the singular gmailId and keeps a plural gmailIds array.
    const keys = historyDedupKeys([
      { date: '2026-08-25', status: 'waiting', note: 'Email reçu · Relance envoyée', gmailIds: ['g-a', 'g-b'] },
    ])
    expect(isNewHistoryEntry(keys, { date: '2026-08-25', status: 'waiting', note: 'anything', gmailId: 'g-a' })).toBe(false)
    expect(isNewHistoryEntry(keys, { date: '2026-08-25', status: 'waiting', note: 'anything', gmailId: 'g-b' })).toBe(false)
  })

  it('still treats an email with a brand-new gmailId as new', () => {
    const keys = historyDedupKeys([
      { date: '2026-08-25', status: 'waiting', note: 'Email reçu', gmailId: 'g-old' },
    ])
    expect(isNewHistoryEntry(keys, { date: '2026-08-25', status: 'waiting', note: 'Nouvel email', gmailId: 'g-new' })).toBe(true)
  })

  it('shields a merged entry\'s constituent emails from re-parsing (filterEmailsBeforeParse reads gmailIds)', () => {
    const job = {
      company: 'eXalt Flow', position: 'Responsable d\'application', status: 'waiting',
      history: [
        { date: '2026-08-25', status: 'waiting', note: 'Email reçu · Relance envoyée', source: 'email', gmailIds: ['g-a', 'g-b'] },
      ],
    }
    const emails = [
      { id: 'g-a', from: 'rh@exaltflow.com', date: daysAgo(3) },
      { id: 'g-b', from: 'rh@exaltflow.com', date: daysAgo(2) },
    ]
    const { kept, reasons } = filterEmailsBeforeParse(emails, [job])
    expect(kept).toEqual([])                 // both already-imported via gmailIds
    expect(reasons.alreadyImported).toBe(2)
  })
})
