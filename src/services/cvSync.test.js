import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-ins: h.local is the IndexedDB CV store, h.remoteDeleteFails
// makes the Supabase delete return an error (offline / expired session).
const h = vi.hoisted(() => ({ local: [], deleted: [], upserts: [], remoteDeletes: [], remoteDeleteFails: false }))

vi.mock('./supabase', () => {
  const from = () => {
    const call = { op: null, id: null }
    const b = {
      upsert: (rows) => { h.upserts.push(rows); return Promise.resolve({ error: null }) },
      delete: () => { call.op = 'delete'; return b },
      eq: (k, v) => { if (k === 'id') call.id = v; return b },
      then: (res, rej) => {
        if (call.op === 'delete') h.remoteDeletes.push(call.id)
        return Promise.resolve({ error: h.remoteDeleteFails ? { message: 'offline' } : null }).then(res, rej)
      },
    }
    return b
  }
  return {
    isSupabaseConfigured: () => true,
    supabase: { from, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
  }
})
vi.mock('./indexeddb', () => ({
  indexeddb: {
    getAllCVs: async () => h.local,
    deleteCV: async (id) => { h.deleted.push(id); h.local = h.local.filter(c => c.id !== id) },
  },
}))

import { reconcileRemoteCVs, pushCV, deleteCVRemote, pushAllCVs } from './cvSync'

const cv = (id) => ({ id, name: id, text: 'x' })

beforeEach(() => {
  localStorage.clear()
  h.local = []; h.deleted = []; h.upserts = []; h.remoteDeletes = []; h.remoteDeleteFails = false
})

describe('reconcileRemoteCVs — a CV deleted on another device stays deleted', () => {
  it('removes a local CV it had seen on the server once the server no longer returns it', async () => {
    h.local = [cv('a'), cv('b')]
    // Poll 1: server has both → both become "known synced".
    await reconcileRemoteCVs([{ id: 'a' }, { id: 'b' }], 'u1', 1000)
    expect(h.deleted).toEqual([])
    // Poll 2: another device deleted `a`.
    const { removed } = await reconcileRemoteCVs([{ id: 'b' }], 'u1', 2000)
    expect(removed).toBe(1)
    expect(h.deleted).toEqual(['a'])
    // …and the init bulk upload must not bring it back.
    await pushAllCVs('u1')
    expect(h.upserts.at(-1).map(r => r.id)).toEqual(['b'])
  })

  it('never removes a local-only CV (not yet seen on the server)', async () => {
    h.local = [cv('new'), cv('b')]
    await reconcileRemoteCVs([{ id: 'b' }], 'u1', 1000)
    await reconcileRemoteCVs([{ id: 'b' }], 'u1', 2000)
    expect(h.deleted).toEqual([])
  })

  it('does not remove a CV whose upload landed after the poll fetch started', async () => {
    h.local = [cv('b'), cv('fresh')]
    await reconcileRemoteCVs([{ id: 'b' }], 'u1', 1000)
    await pushCV(cv('fresh'))                     // marked synced "now" (≫ 1500)
    // This fetch started at t=1500, before the push committed → stale list.
    await reconcileRemoteCVs([{ id: 'b' }], 'u1', 1500)
    expect(h.deleted).toEqual([])
  })

  it('does nothing destructive when the server returns an empty list', async () => {
    h.local = [cv('a')]
    await reconcileRemoteCVs([{ id: 'a' }], 'u1', 1000)
    // Expired session under RLS looks exactly like this: 200 + zero rows.
    const { removed } = await reconcileRemoteCVs([], 'u1', 2000)
    expect(removed).toBe(0)
    expect(h.deleted).toEqual([])
  })
})

describe('deleteCVRemote — a delete made here survives a failed remote call', () => {
  it('keeps the id pending, skips it on the next poll and retries the remote delete', async () => {
    h.remoteDeleteFails = true
    await deleteCVRemote('a')
    // Server still has it; the poll must not re-download it.
    let res = await reconcileRemoteCVs([{ id: 'a' }, { id: 'b' }], 'u1', 1000)
    expect(res.skipIds.has('a')).toBe(true)
    expect(h.remoteDeletes).toEqual(['a', 'a'])   // initial attempt + poll retry
    // Back online: retry succeeds, and once the server agrees it's forgotten.
    h.remoteDeleteFails = false
    res = await reconcileRemoteCVs([{ id: 'a' }, { id: 'b' }], 'u1', 2000)
    expect(res.skipIds.has('a')).toBe(true)
    res = await reconcileRemoteCVs([{ id: 'b' }], 'u1', 3000)
    expect(res.skipIds.size).toBe(0)
  })

  it('clears the pending mark immediately when the remote delete succeeds', async () => {
    await deleteCVRemote('a')
    const res = await reconcileRemoteCVs([{ id: 'b' }], 'u1', 1000)
    expect(res.skipIds.size).toBe(0)
  })
})
