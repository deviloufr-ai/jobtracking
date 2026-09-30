// "Today" as a YYYY-MM-DD string in the user's LOCAL calendar day.
//
// `new Date().toISOString().split('T')[0]` is the UTC day: for a Paris user it
// flips to tomorrow at 22:00 (winter 23:00) and, worse, still reads yesterday
// between midnight and 02:00 — so a step added at 00:30 was stamped on the
// previous day and sorted under the wrong date. Every "default date = today"
// in the UI should go through this instead.
export function localDateISO(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date)) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Local HH:MM for the same instant — pairs with localDateISO so a
// `${date}T${time}` timestamp is built from ONE clock, not UTC day + local time.
export function localTimeHM(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date)) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
