import { describe, it, expect, beforeEach, vi } from 'vitest'

// Controllable supabase mock. `h` is hoisted so the vi.mock factory can close over
// it; tests mutate h.* to simulate online/offline, success/error, and query rows.
const h = vi.hoisted(() => ({
  configured: true,
  userId: 'user-1',
  upsertResult: { error: null },
  queryResult: { data: [], error: null }, // used by select(...) and delete(...) awaits
  calls: { upsert: [], delete: 0 },
}))

vi.mock('./supabase', () => {
  const builder = {
    upsert: (rows, opts) => { h.calls.upsert.push({ rows, opts }); return Promise.resolve(h.upsertResult) },
    select: () => builder,
    eq: () => builder,
    gt: () => builder,
    delete: () => { h.calls.delete++; return builder },
    // Thenable so `await supabase.from(...).select(...).eq(...)` resolves.
    then: (resolve, reject) => Promise.resolve(h.queryResult).then(resolve, reject),
  }
  return {
    isSupabaseConfigured: () => h.configured,
    resolveAuthUserId: () => Promise.resolve(h.userId),
    supabase: { from: () => builder },
  }
})

import {
  enqueueRemoteTombstone,
  flushPendingTombstones,
  fetchRemoteTombstones,
  clearRemoteTombstones,
} from './tombstoneService'

const PENDING_KEY = 'jobtrackr_pending_tombstones'
const pending = () => JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')

beforeEach(() => {
  localStorage.clear()
  h.configured = true
  h.userId = 'user-1'
  h.upsertResult = { error: null }
  h.queryResult = { data: [], error: null }
  h.calls = { upsert: [], delete: 0 }
})

describe('enqueueRemoteTombstone', () => {
  it('writes the tombstone and clears the pending queue on success', async () => {
    await enqueueRemoteTombstone('job-1')
    expect(h.calls.upsert).toHaveLength(1)
    expect(h.calls.upsert[0].rows).toEqual([{ user_id: 'user-1', job_id: 'job-1' }])
    expect(pending()).toEqual([]) // confirmed → removed from pending
  })

  it('keeps the id pending when offline, then flush writes it once back online', async () => {
    h.configured = false
    await enqueueRemoteTombstone('job-2')
    expect(h.calls.upsert).toHaveLength(0) // no write attempted while offline
    expect(pending()).toEqual(['job-2'])  // retained for retry

    h.configured = true
    await flushPendingTombstones('user-1')
    expect(h.calls.upsert).toHaveLength(1)
    expect(pending()).toEqual([])
  })

  it('keeps the id pending when the upsert errors', async () => {
    h.upsertResult = { error: { message: 'boom' } }
    await enqueueRemoteTombstone('job-3')
    expect(pending()).toEqual(['job-3'])
  })
})

describe('fetchRemoteTombstones', () => {
  it('returns the rows for the user', async () => {
    h.queryResult = { data: [{ job_id: 'j1', deleted_at: '2026-06-30T00:00:00Z' }], error: null }
    const rows = await fetchRemoteTombstones('user-1', null)
    expect(rows).toEqual([{ job_id: 'j1', deleted_at: '2026-06-30T00:00:00Z' }])
  })

  it('returns [] on error instead of throwing', async () => {
    h.queryResult = { data: null, error: { message: 'nope' } }
    expect(await fetchRemoteTombstones('user-1', '2026-01-01')).toEqual([])
  })

  it('returns [] when no user id', async () => {
    expect(await fetchRemoteTombstones(null, null)).toEqual([])
  })
})

describe('clearRemoteTombstones', () => {
  it('deletes the user rows and empties the local pending queue', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(['x', 'y']))
    await clearRemoteTombstones('user-1')
    expect(h.calls.delete).toBe(1)
    expect(pending()).toEqual([])
  })
})
