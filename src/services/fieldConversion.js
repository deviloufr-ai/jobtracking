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

export function convertHistoryFromSupabase(supabaseEntry) {
  if (!supabaseEntry) return supabaseEntry
  return {
    date: supabaseEntry.date,
    status: supabaseEntry.status,
    note: supabaseEntry.note,
    meetingLink: supabaseEntry.meeting_link,
    gmailId: supabaseEntry.gmail_id,
    gmailIds: supabaseEntry.gmail_ids ? (typeof supabaseEntry.gmail_ids === 'string' ? JSON.parse(supabaseEntry.gmail_ids) : supabaseEntry.gmail_ids) : null,
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

  // Store only first gmailId if multiple (to avoid array serialization issues)
  let gmailId = localEntry.gmailId || null
  if (!gmailId && localEntry.gmailIds && localEntry.gmailIds.length > 0) {
    gmailId = localEntry.gmailIds[0]
  }

  return {
    date: localEntry.date,
    status: localEntry.status || null,
    note: localEntry.note || null,
    meeting_link: localEntry.meetingLink || null,
    gmail_id: gmailId,
    gmail_ids: null, // Keep as null - we'll use gmail_id only
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

export function deserializeJobFields(job) {
  if (!job) return job

  const jsonFields = ['position_links', 'position_checks']
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
