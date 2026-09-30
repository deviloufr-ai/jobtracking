import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { indexeddb } from './indexeddb'

// jsdom has no IndexedDB; stand in for the sync_queue object store with request
// objects that fire onsuccess on the next microtask (after the handler is set).
const fire = (req, result) => { queueMicrotask(() => { req.result = result; req.onsuccess?.() }) }
function fakeQueueStore(rows, added) {
  return {
    index: () => ({ getAll: () => { const req = {}; fire(req, rows); return req } }),
    add: (data) => { added.push(data); const req = {}; fire(req, data.id); return req },
  }
}

describe('indexeddb sync_queue — replay order is FIFO', () => {
  let added
  beforeEach(() => { added = [] })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('getQueuedMutations returns pending rows sorted by enqueue timestamp, not primary key', async () => {
    // Stored order = UUID order, i.e. whatever index.getAll() hands back.
    const rows = [
      { id: 'b-uuid', type: 'update', timestamp: 2000, status: 'pending' },
      { id: 'a-uuid', type: 'insert', timestamp: 1000, status: 'pending' },
      { id: 'c-uuid', type: 'update', status: 'pending' }, // legacy row without timestamp
    ]
    vi.spyOn(indexeddb, 'getStore').mockImplementation(async () => fakeQueueStore(rows, added))
    const out = await indexeddb.getQueuedMutations()
    expect(out.map(m => m.id)).toEqual(['c-uuid', 'a-uuid', 'b-uuid'])
  })

  it('addToQueue stamps strictly increasing timestamps even within one millisecond', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T10:00:00.000Z'))
    vi.spyOn(indexeddb, 'getStore').mockImplementation(async () => fakeQueueStore([], added))
    const now = Date.now()

    await indexeddb.addToQueue({ id: 'm1', type: 'insert', timestamp: now })
    await indexeddb.addToQueue({ id: 'm2', type: 'update', timestamp: now })
    await indexeddb.addToQueue({ id: 'm3', type: 'update', timestamp: now })

    const stamps = added.map(m => m.timestamp)
    expect(stamps[0]).toBeGreaterThanOrEqual(now)
    expect(stamps[1]).toBeGreaterThan(stamps[0])
    expect(stamps[2]).toBeGreaterThan(stamps[1])
    expect(added.every(m => m.status === 'pending')).toBe(true)
  })
})
