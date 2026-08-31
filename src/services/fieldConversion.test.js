import { describe, it, expect } from 'vitest'
import { settingsToSupabaseRow, SETTINGS_TO_SUPABASE } from './fieldConversion'

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
    // theme / debugLogsEnabled have NO column, gmailPeriodDays is a different unit
    // than the table's gmail_period_months — all must be excluded, not blindly snaked.
    const row = settingsToSupabaseRow('u-1', {
      archiveRejectedDays: 45,
      theme: 'dark',
      debugLogsEnabled: true,
      gmailPeriodDays: 14,
    })
    expect(Object.keys(row).every(k => k === k.toLowerCase() && !/[A-Z]/.test(k))).toBe(true)
    expect(row).not.toHaveProperty('archiveRejectedDays')
    expect(row).not.toHaveProperty('theme')
    expect(row).not.toHaveProperty('debug_logs_enabled')
    expect(row).not.toHaveProperty('gmail_period_days')
    expect(row).not.toHaveProperty('gmail_period_months')
    expect(row.archive_rejected_days).toBe(45)
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
