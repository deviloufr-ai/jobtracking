import { describe, it, expect } from 'vitest'
import {
  settingsToSupabaseRow,
  SETTINGS_TO_SUPABASE,
  convertHistoryToSupabase,
  convertHistoryFromSupabase,
  deserializeJobFields,
} from './fieldConversion'

describe('deserializeJobFields', () => {
  it('parses camelCase positionLinks/positionChecks (the post-snakeToCamel poll path)', () => {
    const out = deserializeJobFields({
      id: 'j1',
      positionLinks: '["https://a.com","https://b.com"]',
      positionChecks: '{"https://a.com":{"available":true}}',
    })
    expect(out.positionLinks).toEqual(['https://a.com', 'https://b.com'])
    expect(out.positionChecks).toEqual({ 'https://a.com': { available: true } })
  })

  it('still parses raw snake_case keys', () => {
    const out = deserializeJobFields({ id: 'j1', position_links: '["x"]' })
    expect(out.position_links).toEqual(['x'])
  })

  it('leaves already-parsed values and unknown fields untouched', () => {
    const out = deserializeJobFields({ id: 'j1', positionLinks: ['x'], other: 'y' })
    expect(out.positionLinks).toEqual(['x'])
    expect(out.other).toBe('y')
  })
})

describe('settingsToSupabaseRow', () => {
  it('maps camelCase settings to their existing snake_case columns', () => {
    const row = settingsToSupabaseRow('u-1', {
      weeklyApps: 5,
      responseRate: 30,
      archiveSentDays: 60,
      archiveRejectedDays: 90,
      checkPositionEnabled: false,
    })
    expect(row.user_id).toBe('u-1')
    expect(row.weekly_apps).toBe(5)
    expect(row.response_rate).toBe(30)
    expect(row.archive_sent_days).toBe(60)
    expect(row.archive_rejected_days).toBe(90)
    expect(row.check_position_enabled).toBe(false)
    expect(typeof row.last_modified_at).toBe('string')
  })

  it('never emits a camelCase key (the PGRST204 crash) and drops columns the table lacks', () => {
    // debugLogsEnabled has NO column (local-only). theme + gmail_period_days ARE
    // real columns (migration 010) and must map; gmail_period_months (legacy unit)
    // is never written.
    const row = settingsToSupabaseRow('u-1', {
      archiveRejectedDays: 45,
      theme: 'dark',
      debugLogsEnabled: true,
      gmailPeriodDays: 21,
    })
    expect(Object.keys(row).every(k => k === k.toLowerCase() && !/[A-Z]/.test(k))).toBe(true)
    expect(row).not.toHaveProperty('archiveRejectedDays')
    expect(row).not.toHaveProperty('debug_logs_enabled')
    expect(row).not.toHaveProperty('gmail_period_months')
    expect(row.archive_rejected_days).toBe(45)
    expect(row.theme).toBe('dark')
    expect(row.gmail_period_days).toBe(21)
  })

  it('is a partial upsert — only present keys become columns, so untouched settings survive on conflict', () => {
    const row = settingsToSupabaseRow('u-1', { weeklyApps: 8 })
    // user_id + last_modified_at + the one mapped column, nothing else.
    expect(new Set(Object.keys(row))).toEqual(new Set(['user_id', 'last_modified_at', 'weekly_apps']))
  })

  it('never carries an id (the id=eq.undefined bug is gone — upsert keys on user_id)', () => {
    const row = settingsToSupabaseRow('u-1', { id: undefined, weeklyApps: 5 })
    expect(row).not.toHaveProperty('id')
  })

  it('every mapped target column is snake_case', () => {
    for (const col of Object.values(SETTINGS_TO_SUPABASE)) {
      expect(col).toMatch(/^[a-z][a-z_]*$/)
    }
  })
})

describe('history gmailIds round-trip (cross-device shield)', () => {
  it('preserves a merged entry\'s full gmailIds array to Supabase (not just the first id)', () => {
    const row = convertHistoryToSupabase({ date: '2026-08-25', status: 'waiting', note: 'a · b', gmailIds: ['g-a', 'g-b'] })
    expect(row.gmail_ids).toEqual(['g-a', 'g-b'])
    expect(row.gmail_id).toBe('g-a') // first, for single-id back-compat readers
  })

  it('stores a single-id entry as gmail_id with gmail_ids null', () => {
    const row = convertHistoryToSupabase({ date: '2026-08-25', status: 'sent', note: 'x', gmailId: 'g-solo' })
    expect(row.gmail_id).toBe('g-solo')
    expect(row.gmail_ids).toBeNull()
  })

  it('merges a singular gmailId into gmailIds without duplication', () => {
    const row = convertHistoryToSupabase({ date: '2026-08-25', status: 'waiting', note: 'x', gmailId: 'g-a', gmailIds: ['g-a', 'g-b'] })
    expect(row.gmail_ids).toEqual(['g-a', 'g-b'])
  })

  it('reads a multi-id entry back as gmailIds with NO singular gmailId (canonical-key stable)', () => {
    const entry = convertHistoryFromSupabase({ date: '2026-08-25', status: 'waiting', note: 'a · b', gmail_id: 'g-a', gmail_ids: ['g-a', 'g-b'] })
    expect(entry.gmailIds).toEqual(['g-a', 'g-b'])
    expect(entry.gmailId).toBeUndefined() // matches mergeTopicGroup: plural only, no singular
  })

  it('reads a single-id entry back as a singular gmailId', () => {
    const entry = convertHistoryFromSupabase({ date: '2026-08-25', status: 'sent', note: 'x', gmail_id: 'g-solo', gmail_ids: null })
    expect(entry.gmailId).toBe('g-solo')
    expect(entry.gmailIds).toBeNull()
  })

  it('round-trips a merged entry so its ids survive (the cross-device phantom shield)', () => {
    const local = { date: '2026-08-25', status: 'waiting', note: 'a · b', gmailIds: ['g-a', 'g-b'] }
    const back = convertHistoryFromSupabase(convertHistoryToSupabase(local))
    expect(back.gmailIds).toEqual(['g-a', 'g-b'])
    expect(back.gmailId).toBeUndefined()
  })

  it('tolerates a JSON-string gmail_ids column without throwing', () => {
    const entry = convertHistoryFromSupabase({ date: '2026-08-25', status: 'waiting', note: 'a · b', gmail_ids: '["g-a","g-b"]' })
    expect(entry.gmailIds).toEqual(['g-a', 'g-b'])
  })
})
