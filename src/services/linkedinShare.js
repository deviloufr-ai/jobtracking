// Helpers for the "add a candidature from a LinkedIn share link" flow.
//
// A share can arrive two ways:
//   1. the user pastes a link into the LinkedIn-import modal, or
//   2. Android hands the app the shared text via the share sheet (see
//      shareIntake.js + the native MainActivity intent-filter).
// The shared text is not always a bare URL — some apps prepend the job title
// ("Senior PM https://www.linkedin.com/jobs/view/123/"), so we pull the first
// http(s) URL out of whatever we're given.

const URL_RE = /https?:\/\/[^\s<>"')]+/i

// LinkedIn's own hosts, plus the lnkd.in shortener its apps emit.
const LINKEDIN_HOST_RE = /(^|\.)(linkedin\.com|lnkd\.in)$/i

// Extract the first http(s) URL from arbitrary shared text. Returns '' if none.
export function extractUrl(text) {
  if (!text || typeof text !== 'string') return ''
  const m = text.match(URL_RE)
  if (!m) return ''
  // Trim trailing punctuation a sentence might leave on the URL.
  return m[0].replace(/[.,;)]+$/, '')
}

function hostOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}

// Is this a LinkedIn link (job page or lnkd.in shortener)?
export function isLinkedInUrl(url) {
  return LINKEDIN_HOST_RE.test(hostOf(url))
}

// Does the URL (or shared text containing one) point at LinkedIn?
export function looksLikeLinkedInShare(text) {
  return isLinkedInUrl(extractUrl(text) || text)
}

// The numeric LinkedIn job id, when the URL is a canonical /jobs/view/<id> or a
// collections page carrying ?currentJobId=<id>. Used only for display/dedup on
// the client — the server does the authoritative resolution.
export function linkedInJobId(url) {
  let u
  try { u = new URL(url) } catch { return null }
  if (!LINKEDIN_HOST_RE.test(u.hostname)) return null
  const view = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/i)
  if (view) return view[1]
  const cur = u.searchParams.get('currentJobId')
  if (cur && /^\d{6,}$/.test(cur)) return cur
  return null
}
