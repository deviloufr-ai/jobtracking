import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// In-memory stand-in for the IndexedDB sync_queue store. Tests seed h.queue and
// read it back to see what flushQueue removed / rewrote.
const h = vi.hoisted(() => ({ configured: true, queue: [] }))

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => h.configured,
  supabase: { from: () => ({}) },
}))
vi.mock('./indexeddb', () => ({
  indexeddb: {
    getQueuedMutations: async () => h.queue.filter(m => m.status === 'pending').map(m => ({ ...m })),
    removeFromQueue: async (id) => { h.queue = h.queue.filter(m => m.id !== id) },
    updateQueuedMutation: async (m) => { h.queue = h.queue.map(x => (x.id === m.id ? m : x)) },
    addToQueue: async (m) => { h.queue.push({ ...m, status: 'pending' }) },
    saveJob: async () => {},
    deleteJob: async () => {},
    saveCV: async () => {},
    saveSettings: async () => {},
  },
}))
vi.mock('./fieldConversion', () => ({
  convertHistoryToSupabase: (x) => x,
  settingsToSupabaseRow: (_u, r) => r,
}))
vi.mock('../hooks/useJobs', () => ({ historyEntryKey: (e) => e?.id || JSON.stringify(e) }))

import { syncManager } from './syncManager'

const mut = (id, recordId, extra = {}) => ({
  id, table: 'jobs', type: 'update', record: { id: recordId }, status: 'pending', timestamp: Date.now(), ...extra,
})
const ids = () => h.queue.map(m => m.id)

describe('syncManager.flushQueue', () => {
  let send
  beforeEach(() => {
    h.queue = []
    h.configured = true
    syncManager.userId = null
    syncManager.syncInProgress = false
    syncManager.listeners = []
    send = vi.spyOn(syncManager, 'sendMutationToSupabase')
  })
  afterEach(() => { send.mockRestore() })

  it('does nothing (and does not take the lock) without a userId', async () => {
    h.queue = [mut('a', 'job-1')]
    await syncManager.flushQueue()
    expect(send).not.toHaveBeenCalled()
    expect(syncManager.syncInProgress).toBe(false)
    expect(ids()).toEqual(['a'])
  })

  it('a failing mutation blocks only its own record; the rest of the queue still drains', async () => {
    h.queue = [mut('a', 'job-1'), mut('b', 'job-2'), mut('c', 'job-1')]
    send.mockImplementation(async (_u, _t, _type, record) => {
      if (record.id === 'job-1') throw new Error('400 bad row')
      return { success: true }
    })
    await syncManager.flushQueue('user-1')

    // job-2 went through; job-1's first mutation failed and its later one was NOT
    // attempted this pass (it must not overtake the failed one).
    expect(send.mock.calls.map(c => c[3].id)).toEqual(['job-1', 'job-2'])
    expect(ids()).toEqual(['a', 'c'])
    expect(h.queue[0].attempts).toBe(1)
    expect(h.queue[0].lastError).toMatch(/bad row/)
    expect(h.queue[1].attempts).toBeUndefined()
  })

  it('drops a mutation once it has failed maxRetries times', async () => {
    h.queue = [mut('a', 'job-1', { attempts: syncManager.maxRetries - 1 }), mut('b', 'job-2')]
    send.mockImplementation(async (_u, _t, _type, record) => {
      if (record.id === 'job-1') throw new Error('409 conflict')
      return { success: true }
    })
    await syncManager.flushQueue('user-1')
    expect(ids()).toEqual([])
  })

  it('an auth failure pauses the pass without counting an attempt', async () => {
    h.queue = [mut('a', 'job-1'), mut('b', 'job-2')]
    send.mockRejectedValue(new Error('User not authenticated'))
    await syncManager.flushQueue('user-1')
    expect(send).toHaveBeenCalledTimes(1)
    expect(ids()).toEqual(['a', 'b'])
    expect(h.queue[0].attempts).toBeUndefined()
  })

  it('reports error status while failures remain, synced once the queue is clean', async () => {
    const seen = []
    syncManager.onStatusChange(s => seen.push(s.status))
    h.queue = [mut('a', 'job-1')]
    send.mockRejectedValueOnce(new Error('500')).mockResolvedValue({ success: true })
    await syncManager.flushQueue('user-1')
    expect(seen.at(-1)).toBe('error')
    await syncManager.flushQueue('user-1')
    expect(seen.at(-1)).toBe('synced')
    expect(ids()).toEqual([])
  })

  it('stays silent on an empty queue (runs before every poll)', async () => {
    const seen = []
    syncManager.onStatusChange(s => seen.push(s.status))
    await syncManager.flushQueue('user-1')
    expect(seen).toEqual([])
  })

  it('remembers the userId so the online handler can flush', async () => {
    h.queue = [mut('a', 'job-1')]
    send.mockResolvedValue({ success: true })
    await syncManager.mutate('user-1', 'jobs', 'update', { id: 'job-9' })
    expect(syncManager.userId).toBe('user-1')
    // A successful online write kicks a flush of what was still queued.
    await vi.waitFor(() => expect(ids()).toEqual([]))
    h.queue = [mut('b', 'job-2')]
    syncManager.handleOnline()
    await vi.waitFor(() => expect(ids()).toEqual([]))
  })
})
