// Parse a raw email "from" value into { name, email }.
//
// Consolidates the near-identical inline parsers that were copy-pasted across
// JobRow, CandidatureDrawer and ContactsManager. Accepts the two shapes seen in
// job_history entries: "Display Name <addr@host>" and a bare "addr@host". Returns
// null when there's no usable address. Callers apply their own isNoReply() /
// dedup / iteration on top.

// Strip surrounding quotes/whitespace a display name is often wrapped in, e.g.
// `"Anita Roy" <a@b>`, so the parsed name is clean.
const cleanName = (n = '') => n.replace(/^["'\s]+|["'\s]+$/g, '').trim()

export function parseSender(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/^([^<]+)<([^>]+)>/)
  if (m) return { name: cleanName(m[1]), email: m[2].trim() }
  if (s.includes('@')) return { name: s.split('@')[0], email: s }
  return null
}
