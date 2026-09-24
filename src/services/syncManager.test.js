import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// In-memory stand-ins for the IndexedDB sync_queue store and the Supabase query
// builder. Tests seed h.queue / h.sb.respond and read back what was written.
const h = vi.hoisted(() => ({
  configured: true,
  queue: [],
  deadKeys: [],
  sb: { calls: [], respond: null },
}))

vi.mock('./supabase', () => {
  // Chainable, thenable builder recording {table, op, args, filters}; the awaited
  // result comes from h.sb.respond(call) or defaults to an empty success.
  const make = (table) => {
    const call = { table, op: null, args: [], filters: [] }
    const b = {
      upsert: (rows, opts) => { call.op = 'upsert'; call.args = [rows, opts]; return b },
      insert: (rows) => { call.op = 'insert'; call.args = [rows]; return b },
      update: (row) => { call.op = 'update'; call.args = [row]; return b },
      delete: () => { call.op = 'delete'; return b },
      select: () => b,
      maybeSingle: () => b,
      eq: (k, v) => { call.filters.push(['eq', k, v]); return b },
      is: (k, v) => { call.filters.push(['is', k, v]); return b },
      in: (k, v) => { call.filters.push(['in', k, v]); return b },
      then: (res, rej) => {
        h.sb.calls.push(call)
        return Promise.resolve(h.sb.respond?.(call) || { data: [], error: null }).then(res, rej)
      },
    }
    return b
  }
  return { isSupabaseConfigured: () => h.configured, supabase: { from: make } }
})
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
  convertHistoryToSupabase: (e) => ({ date: e.date, status: e.status || null, note: e.note || null, gmail_id: e.gmailId || null }),
  settingsToSupabaseRow: (_u, r) => r,
}))
vi.mock('../hooks/useJobs', () => ({
  historyEntryKey: (e) => (e?.gmailId ? `gmail:${e.gmailId}` : `${(e?.date || '').split('T')[0]}||${e?.status || ''}||${(e?.note || '').toLowerCase()}`),
  deletedHistoryKeysFor: () => h.deadKeys,
}))

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

describe('syncManager.writeJobHistory', () => {
  const e1 = { date: '2026-01-01', status: 'sent', note: 'Applied', gmailId: 'g1' }
  const e2 = { date: '2026-01-02T09:30:00.000Z', status: 'interview', note: 'Call with Ana' }
  const e1dup = { ...e1, note: 'Applied (copy)' } // same gmailId → same key
  const ops = () => h.sb.calls.map(c => `${c.op}${c.filters.map(f => `:${f[0]}(${f[1]})`).join('')}`)

  beforeEach(() => {
    h.sb.calls = []
    h.sb.respond = null
    h.deadKeys = []
    syncManager.historyUpsertSupported = undefined
  })

  it('upserts on (job_id, entry_key) with the canonical key, then removes only legacy key-less rows', async () => {
    const out = await syncManager.writeJobHistory('user-1', 'job-1', [e1, e2, e1dup])
    expect(out.mode).toBe('upsert')
    expect(ops()).toEqual(['upsert', 'delete:eq(job_id):eq(user_id):is(entry_key)'])
    const [rows, opts] = h.sb.calls[0].args
    expect(opts).toEqual({ onConflict: 'job_id,entry_key' })
    expect(rows.map(r => r.entry_key)).toEqual(['gmail:g1', '2026-01-02||interview||call with ana'])
    expect(rows[0]).toMatchObject({ job_id: 'job-1', user_id: 'user-1', gmail_id: 'g1' })
    expect(syncManager.historyUpsertSupported).toBe(true)
  })

  it('also deletes the rows this device tombstoned, by key', async () => {
    h.deadKeys = ['2026-01-03||rejected||no thanks']
    await syncManager.writeJobHistory('user-1', 'job-1', [e1])
    expect(ops()).toEqual(['upsert', 'delete:eq(job_id):eq(user_id):is(entry_key)', 'delete:eq(job_id):eq(user_id):in(entry_key)'])
    expect(h.sb.calls[2].filters.at(-1)[2]).toEqual(h.deadKeys)
  })

  it('falls back to replace-all while migration 016 is not applied, and remembers it', async () => {
    h.sb.respond = (c) => (c.op === 'upsert' ? { error: { code: 'PGRST204', message: "Could not find the 'entry_key' column of 'job_history'" } } : null)
    const out = await syncManager.writeJobHistory('user-1', 'job-1', [e1, e2])
    expect(out.mode).toBe('replace')
    expect(ops()).toEqual(['upsert', 'delete:eq(job_id)', 'insert'])
    // Legacy rows carry no entry_key (the column does not exist yet).
    expect(h.sb.calls[2].args[0].every(r => !('entry_key' in r))).toBe(true)
    expect(syncManager.historyUpsertSupported).toBe(false)

    h.sb.calls = []
    await syncManager.writeJobHistory('user-1', 'job-2', [e1])
    expect(ops()).toEqual(['delete:eq(job_id)', 'insert']) // no upsert attempt this session
  })

  it('surfaces a real upsert error instead of silently replacing the timeline', async () => {
    h.sb.respond = (c) => (c.op === 'upsert' ? { error: { code: '23503', message: 'foreign key violation' } } : null)
    await expect(syncManager.writeJobHistory('user-1', 'job-1', [e1])).rejects.toMatchObject({ code: '23503' })
    expect(syncManager.historyUpsertSupported).toBeUndefined()
    expect(ops()).toEqual(['upsert'])
  })
})
