import { describe, it, expect } from 'vitest'
import { computeWeeklyRecap } from './WeeklyRecap'
import { mondayOf } from '../utils/metrics'

const weekStart = mondayOf(new Date('2026-09-30T12:00:00'))
const day = (offset, time = '10:00:00') => {
  const d = new Date(weekStart.getTime() + offset * 86400000)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${time}`
}

describe('computeWeeklyRecap — status changes', () => {
  it('counts consecutive same-status entries as ONE change', () => {
    // Acknowledgement, then a "still under review" follow-up: both `reviewing`.
    const jobs = [{
      id: 'k', company: 'Kolecto', status: 'reviewing', date: day(-20),
      history: [
        { date: day(-20), status: 'sent' },
        { date: day(0), status: 'reviewing', note: 'Candidature reçue' },
        { date: day(1), status: 'reviewing', note: 'Dossier en cours d’examen' },
      ],
    }]
    const r = computeWeeklyRecap(jobs, weekStart)
    expect(r.responses).toBe(1)
    expect(r.events).toHaveLength(1)
    expect(r.events[0]).toMatchObject({ company: 'Kolecto', status: 'reviewing' })
  })

  it('does not report a status that was already reached before the window', () => {
    const jobs = [{
      id: 'a', company: 'Acme', status: 'reviewing', date: day(-30),
      history: [
        { date: day(-30), status: 'sent' },
        { date: day(-10), status: 'reviewing' },   // last week
        { date: day(2), status: 'reviewing' },     // this week — same status, no change
      ],
    }]
    expect(computeWeeklyRecap(jobs, weekStart).events).toHaveLength(0)
  })

  it('still reports each real change within the week', () => {
    const jobs = [{
      id: 'a', company: 'Acme', status: 'rejected', date: day(-5),
      history: [
        { date: day(-5), status: 'sent' },
        { date: day(0), status: 'reviewing' },
        { date: day(2), status: 'interview' },
        { date: day(4), status: 'rejected' },
      ],
    }]
    const r = computeWeeklyRecap(jobs, weekStart)
    expect([r.responses, r.interviews, r.rejections]).toEqual([1, 1, 1])
    expect(r.events).toHaveLength(3)
  })
})
