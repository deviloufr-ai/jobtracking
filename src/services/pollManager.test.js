import { describe, it, expect, beforeEach, vi } from 'vitest'

// Supabase stand-in that honours .range() and .in() so the poll's paging and
// id-chunking can be observed. Rows come from h.jobs / h.history.
const h = vi.hoisted(() => ({ calls: [], jobs: [], history: [], saved: [] }))

vi.mock('./supabase', () => {
  const make = (table) => {
    const call = { table, filters: [], order: [], range: null }
    const b = {
      select: () => b,
      maybeSingle: () => b,
      eq: (k, v) => { call.filters.push(['eq', k, v]); return b },
      gt: (k, v) => { call.filters.push(['gt', k, v]); return b },
      in: (k, v) => { call.filters.push(['in', k, v]); return b },
      order: (k) => { call.order.push(k); return b },
      range: (from, to) => { call.range = [from, to]; return b },
      then: (res, rej) => {
        h.calls.push(call)
        const page = (rows) => (call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows)
        let out = { data: [], error: null }
        if (table === 'jobs') out = { data: page(h.jobs), error: null }
        if (table === 'job_history') {
          const ids = call.filters.find(f => f[0] === 'in')?.[2] || []
          out = { data: page(h.history.filter(r => ids.includes(r.job_id))), error: null }
        }
        if (table === 'user_settings') out = { data: null, error: null }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return b
  }
  return { isSupabaseConfigured: () => true, supabase: { from: make } }
})
vi.mock('./indexeddb', () => ({
  indexeddb: {
    getMetadata: async () => null,
    setMetadata: async () => {},
    getJob: async () => undefined,
    saveJob: async (job) => { h.saved.push(job) },
    getSettings: async () => ({}),
    saveSettings: async () => {},
    saveCV: async () => {},
    getAllJobs: async () => [],
    deleteJob: async () => {},
  },
}))
vi.mock('./fieldConversion', () => ({
  convertHistoryFromSupabase: (e) => ({ ...e }),
  snakeToCamel: (x) => x,
  deserializeJobFields: (x) => x,
  normalizeServerTimestamp: (x) => x,
}))
vi.mock('../hooks/useJobs', () => ({
  isDeletedJobId: () => false,
  deduplicateHistory: (x) => x,
  filterDeletedHistory: (_id, entries) => entries,
  historyEntryKey: (e) => e.id,
  markJobIdAsDeletedLocal: () => {},
  markHistoryEntryKeysDeletedLocal: () => {},
  partitionJobsByTombstones: () => ({ removed: [] }),
  deriveStatusFromHistory: () => null,
}))
vi.mock('./tombstoneService', () => ({
  flushPendingTombstones: async () => {},
  fetchRemoteTombstones: async () => [],
  flushPendingHistoryTombstones: async () => {},
  fetchRemoteHistoryTombstones: async () => [],
}))
vi.mock('./featureFlags', () => ({ getFlag: () => false, FLAGS: {} }))

import { pollManager, fetchAllPages } from './pollManager'

const byTable = (t) => h.calls.filter(c => c.table === t)

describe('fetchAllPages', () => {
  it('stops after a short page and concatenates the pages in order', async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({ i }))
    const ranges = []
    const build = () => ({ range: async (a, z) => { ranges.push([a, z]); return { data: rows.slice(a, z + 1), error: null } } })
    const { data, error } = await fetchAllPages(build)
    expect(error).toBeNull()
    expect(data).toHaveLength(2300)
    expect(data.at(-1).i).toBe(2299)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('issues a single request when the first page is short', async () => {
    let n = 0
    const { data } = await fetchAllPages(() => ({ range: async () => { n++; return { data: [1, 2], error: null } } }))
    expect(data).toEqual([1, 2])
    expect(n).toBe(1)
  })

  it('surfaces a page error instead of returning a partial list', async () => {
    let n = 0
    const build = () => ({ range: async () => (++n === 1
      ? { data: Array(1000).fill({}), error: null }
      : { data: null, error: { message: 'boom' } }) })
    const { data, error } = await fetchAllPages(build)
    expect(data).toBeNull()
    expect(error.message).toBe('boom')
  })
})

describe('pollManager.poll — pages past the 1000-row cap and chunks the history .in()', () => {
  beforeEach(() => {
    h.calls = []
    h.saved = []
    pollManager.lastSyncTime = null
    // 1500 jobs; the first one carries 1200 history entries (ascending dates —
    // exactly the shape where the 1000-row cap used to drop the NEWEST rows).
    h.jobs = Array.from({ length: 1500 }, (_, i) => ({ id: `job-${String(i).padStart(4, '0')}`, user_id: 'u1' }))
    h.history = []
    for (let i = 0; i < 1200; i++) h.history.push({ id: `h0-${i}`, job_id: 'job-0000', date: `2025-01-${i}` })
    for (let i = 1; i < 1500; i++) h.history.push({ id: `h${i}`, job_id: `job-${String(i).padStart(4, '0')}`, date: '2026-01-01' })
  })

  it('full sync fetches every job and every history entry', async () => {
    await pollManager.poll('u1', { fullSync: true })

    expect(byTable('jobs').map(c => c.range)).toEqual([[0, 999], [1000, 1999]])
    expect(h.saved).toHaveLength(1500)

    const historyCalls = byTable('job_history')
    // 1500 ids → 15 chunks of ≤100; the first chunk (1299 rows) needs two pages.
    for (const c of historyCalls) expect(c.filters.find(f => f[0] === 'in')[2].length).toBeLessThanOrEqual(100)
    expect(historyCalls.length).toBe(16)
    expect(historyCalls.every(c => c.order.includes('date'))).toBe(true)

    const first = h.saved.find(j => j.id === 'job-0000')
    expect(first.history).toHaveLength(1200)
    expect(first.history.at(-1).id).toBe('h0-1199')
    expect(h.saved.find(j => j.id === 'job-1499').history).toHaveLength(1)
  })

  it('incremental poll keeps the updated_at filter on every page', async () => {
    pollManager.lastSyncTime = '2026-09-01T00:00:00.000Z'
    await pollManager.poll('u1')
    const jobCalls = byTable('jobs')
    expect(jobCalls.length).toBe(2)
    expect(jobCalls.every(c => c.filters.some(f => f[0] === 'gt' && f[1] === 'updated_at'))).toBe(true)
  })
})
