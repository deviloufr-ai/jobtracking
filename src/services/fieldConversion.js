// Utility functions for converting between camelCase (local) and snake_case (Supabase)

export function snakeToCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const camel = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
    // Handle special cases
    if (camelKey === 'gmailIds' && typeof value === 'string') {
      try {
        camel[camelKey] = JSON.parse(value)
      } catch {
        camel[camelKey] = value
      }
    } else {
      camel[camelKey] = value
    }
  }
  return camel
}

export function camelToSnake(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const snake = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    snake[snakeKey] = value
  }
  return snake
}

function parseGmailIds(raw) {
  if (!raw) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch { return null }
  }
  return null
}

export function convertHistoryFromSupabase(supabaseEntry) {
  if (!supabaseEntry) return supabaseEntry

  const ids = parseGmailIds(supabaseEntry.gmail_ids)
  const hasMulti = ids && ids.length > 1
  // Preserve the canonical-key invariant of a topic-merged entry: MANY ids → keep
  // the plural array and NO singular gmailId (historyEntryKey falls back to
  // date||status||note, identical to the device that created the merge via
  // mergeTopicGroup). ONE id → singular gmailId (historyEntryKey = gmail:<id>).
  // Emitting both for a merged entry would give the same logical entry different
  // keys on different devices → a cross-device doublon.
  const gmailId = hasMulti ? undefined : (supabaseEntry.gmail_id || (ids && ids.length === 1 ? ids[0] : undefined))
  const gmailIds = hasMulti ? ids : null

  return {
    date: supabaseEntry.date,
    status: supabaseEntry.status,
    note: supabaseEntry.note,
    meetingLink: supabaseEntry.meeting_link,
    gmailId,
    gmailIds,
    offerUrl: supabaseEntry.offer_url,
    showCVButton: supabaseEntry.show_cv_button,
    from: supabaseEntry.from_email,
    fromMe: supabaseEntry.from_me,
    source: supabaseEntry.source,
    body: supabaseEntry.email_body,
    subject: supabaseEntry.email_subject,
    receivedBy: supabaseEntry.received_by
  }
}

export function convertHistoryToSupabase(localEntry) {
  if (!localEntry) return localEntry

  // Preserve the FULL set of Gmail ids. A same-day topic merge (mergeTopicGroup)
  // collapses several emails into ONE entry carrying a `gmailIds` array and drops
  // the singular gmailId. Storing only the first id (the old behavior) lost the
  // rest on a Supabase round-trip, so the pre-parse "already-imported" shield
  // (filterEmailsBeforeParse reads gmailIds) broke on other devices and the merged
  // email got re-parsed + re-notified. gmail_ids is a text[] column (migration 001).
  const allIds = [...new Set([
    ...(Array.isArray(localEntry.gmailIds) ? localEntry.gmailIds : []),
    ...(localEntry.gmailId ? [localEntry.gmailId] : []),
  ])]

  return {
    date: localEntry.date,
    status: localEntry.status || null,
    note: localEntry.note || null,
    meeting_link: localEntry.meetingLink || null,
    gmail_id: allIds[0] || null,
    gmail_ids: allIds.length > 1 ? allIds : null,
    offer_url: localEntry.offerUrl || null,
    show_cv_button: localEntry.showCVButton || false,
    from_email: localEntry.from || null,
    from_me: localEntry.fromMe || false,
    source: localEntry.source || null,
    email_body: (localEntry.body || '').slice(0, 2000) || null,
    email_subject: localEntry.subject || null,
    received_by: localEntry.receivedBy || null,
    version: 1,
    device_id: localEntry.device_id || null,
    last_modified_at: new Date().toISOString()
  }
}

// ─── user_settings camelCase → snake_case ─────────────────────────────────────
// The app keeps settings in camelCase; the user_settings table is snake_case.
// A blind camelToSnake is NOT safe here: the table has NO column for
// `debugLogsEnabled` (kept local-only, consistent with featureFlags.js), and its
// legacy `gmail_period_months` column is a different UNIT than the app's
// `gmailPeriodDays` — so a blind conversion sends unknown columns and PostgREST
// rejects the whole write (PGRST204 "Could not find the 'archiveRejectedDays'
// column"). Map only real columns, by explicit name. `theme` and
// `gmail_period_days` require migration 010.
export const SETTINGS_TO_SUPABASE = {
  weeklyApps: 'weekly_apps',
  responseRate: 'response_rate',
  monthlyInterviews: 'monthly_interviews',
  archiveSentDays: 'archive_sent_days',
  archiveRejectedDays: 'archive_rejected_days',
  followUpSentDays: 'follow_up_sent_days',
  followUpReviewingDays: 'follow_up_reviewing_days',
  followUpWaitingDays: 'follow_up_waiting_days',
  followUpOfferDays: 'follow_up_offer_days',
  autoRefreshHours: 'auto_refresh_hours',
  checkPositionAfterDays: 'check_position_after_days',
  checkPositionEnabled: 'check_position_enabled',
  gmailPeriodDays: 'gmail_period_days', // migration 010
  theme: 'theme',                       // migration 010
}

// Build a user_settings row for an upsert(onConflict: 'user_id'). Only maps keys
// present in the record, so a partial settings patch touches only those columns
// (and leaves the rest of the row untouched on conflict). `user_id` is required.
export function settingsToSupabaseRow(userId, record = {}) {
  const row = { user_id: userId, last_modified_at: new Date().toISOString() }
  for (const [camel, snake] of Object.entries(SETTINGS_TO_SUPABASE)) {
    if (record[camel] !== undefined) row[snake] = record[camel]
  }
  return row
}

export function deserializeJobFields(job) {
  if (!job) return job

  // Accept BOTH camelCase and snake_case keys. pollManager calls this AFTER
  // snakeToCamel, so the live keys are positionLinks/positionChecks; only the
  // snake_case keys were handled before, so post-conversion the fields stayed
  // JSON strings and checkAllPositions ran .slice()/.length on a string.
  const jsonFields = ['positionLinks', 'position_links', 'positionChecks', 'position_checks']
  const deserialized = { ...job }

  for (const field of jsonFields) {
    if (deserialized[field] && typeof deserialized[field] === 'string') {
      try {
        deserialized[field] = JSON.parse(deserialized[field])
      } catch (e) {
        console.warn(`Failed to parse ${field}:`, e)
        // Keep original if parse fails
      }
    }
  }

  return deserialized
}
