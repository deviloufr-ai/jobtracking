import { describe, it, expect } from 'vitest'
import { buildRejectionEvidence } from './rejectionEvidence'

const jobs = [
  // rejected before any reply (ATS), CV weak, recurring gap "SQL"
  {
    id: '1', company: 'Alan', position: 'PM', source: 'linkedin', status: 'rejected_ats',
    cvSaved: { markdown: 'x', atsScore: 88, impactScore: 50 },
    scoreDetails: { score: 60, verdict: 'PARTIAL_MATCH', gaps: ['SQL', 'B2B'] },
    history: [{ status: 'sent', date: '2026-01-01' }, { status: 'rejected_ats', date: '2026-01-03', note: 'Automated: not selected' }],
  },
  // human rejection after a screen, recurring gap "SQL"
  {
    id: '2', company: 'Qonto', position: 'PM', source: 'apec', status: 'rejected',
    cvSaved: { markdown: 'x', atsScore: 80, impactScore: 55 },
    scoreDetails: { score: 65, verdict: 'PARTIAL_MATCH', gaps: ['SQL', 'fintech'] },
    history: [{ status: 'sent', date: '2026-01-01' }, { status: 'reviewing', date: '2026-01-04' }, { status: 'rejected', date: '2026-01-10', note: 'We went with another candidate' }],
  },
  // reached interview, then rejected — in BOTH sets; CV stronger
  {
    id: '3', company: 'Doctolib', position: 'PM', source: 'linkedin', status: 'rejected',
    cvSaved: { markdown: 'x', atsScore: 92, impactScore: 82 },
    scoreDetails: { score: 78, verdict: 'GOOD_MATCH', gaps: ['healthcare'] },
    history: [{ status: 'sent', date: '2026-01-01' }, { status: 'interview', date: '2026-01-06' }, { status: 'rejected', date: '2026-01-15' }],
  },
  // still interviewing (not rejected) — interviewed set only, strong CV
  {
    id: '4', company: 'Payfit', position: 'PM', source: 'apec', status: 'interview',
    cvSaved: { markdown: 'x', atsScore: 90, impactScore: 80 },
    scoreDetails: { score: 80, verdict: 'GOOD_MATCH', gaps: [] },
    history: [{ status: 'sent', date: '2026-01-02' }, { status: 'interview', date: '2026-01-07' }],
  },
  // candidate-cancelled — NOT an employer rejection
  { id: '5', company: 'Swile', position: 'PM', source: 'linkedin', status: 'cancelled', history: [{ status: 'sent', date: '2026-01-01' }] },
  // still todo — not sent
  { id: '6', company: 'Spendesk', position: 'PM', status: 'todo', history: [] },
]

describe('buildRejectionEvidence', () => {
  const e = buildRejectionEvidence(jobs)

  it('flags data and counts employer rejections (excl. cancelled/todo)', () => {
    expect(e.hasData).toBe(true)
    expect(e.totals.rejected).toBe(3)       // ids 1,2,3
    expect(e.totals.sent).toBe(5)           // all but todo
  })

  it('builds the interviewed contrast set (reached interview, any final status)', () => {
    expect(e.totals.interviewed).toBe(2)    // ids 3 (rejected-after-interview) + 4
  })

  it('averages CV impact separately for rejected vs interviewed', () => {
    // rejected impacts: 50, 55, 82 → 62 ; interviewed: 82, 80 → 81
    expect(e.averages.rejected.cvImpact).toBe(62)
    expect(e.averages.interviewed.cvImpact).toBe(81)
  })

  it('surfaces gaps that recur across rejections (>=2)', () => {
    const sql = e.recurringGaps.find(g => g.gap.toLowerCase() === 'sql')
    expect(sql?.count).toBe(2)
    // a one-off gap does not appear
    expect(e.recurringGaps.find(g => g.gap.toLowerCase() === 'healthcare')).toBeUndefined()
  })

  it('classifies each rejected record by stage and type', () => {
    const byCompany = Object.fromEntries(e.rejectedSamples.map(r => [r.company, r]))
    expect(byCompany.Alan.type).toBe('ats')
    expect(byCompany.Alan.stage).toBe('no_response')
    expect(byCompany.Qonto.stage).toBe('after_screen')
    expect(byCompany.Doctolib.stage).toBe('after_interview')
    expect(byCompany.Qonto.type).toBe('human')
  })

  it('captures the rejection email note', () => {
    const qonto = e.rejectedSamples.find(r => r.company === 'Qonto')
    expect(qonto.rejectionNote).toContain('another candidate')
  })

  it('returns hasData false when there are no employer rejections', () => {
    const none = buildRejectionEvidence([{ id: 'a', status: 'sent', history: [] }, { id: 'b', status: 'interview', history: [] }])
    expect(none.hasData).toBe(false)
    expect(none.totals.rejected).toBe(0)
  })
})
