import { applyCors, assertSafeUrl, safeFetch, getClientIp, rateLimit } from './_lib/http.js'

const CLOSED_INDICATORS = [
  'position closed', 'job closed', 'this position is closed',
  'application closed', 'applications closed',
  'this position has been filled', 'position filled', 'position has been filled',
  'no longer accepting applications', 'no longer hiring',
  'this position is no longer available', 'position no longer available',
  'already filled', 'this role has been filled',
  'this job has been filled', 'job has been filled',
  'we are no longer accepting', 'we\'re no longer accepting',
  'position not available',
  'offre pourvue', 'poste pourvu', 'candidature close', 'recrutement terminé',
  // LinkedIn-specific patterns
  'no longer accepting',
  'not accepting applications',
  'positions filled', 'all positions filled',
  // Generic patterns
  'hiring has closed', 'recruitment closed', 'job posting closed',
  'this posting is no longer active', 'posting is no longer active',
  'no open positions', 'no openings', 'currently hiring: false',
]

const OPEN_INDICATORS = [
  'apply now', 'apply today', 'join our team',
  'we\'re hiring', 'we are hiring', 'we\'re looking for',
  'apply', 'postuler', 'candidater', 'rejoignez',
  'share your resume', 'send us your cv',
]

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function detectAvailability(content) {
  const lower = content.toLowerCase()

  // High-confidence CLOSED: an explicit "closed/filled/no longer accepting" phrase
  // appears in the visible page text. Anything weaker is too risky — a wrong
  // "closed" verdict auto-rejects the application (see checkPosition() in useJobs.js).
  for (const indicator of CLOSED_INDICATORS) {
    if (lower.includes(indicator)) {
      return { available: false, reason: `Detected: "${indicator}"` }
    }
  }

  // Confirm OPEN only with clear apply/hiring cues (need at least 2 to avoid a
  // stray "apply" in boilerplate flipping the verdict).
  let openScore = 0
  for (const indicator of OPEN_INDICATORS) {
    if (lower.includes(indicator)) openScore++
  }
  if (openScore >= 2) {
    return { available: true, reason: 'Found apply/career indicators' }
  }

  // Otherwise: unknown. Most ATS pages (Greenhouse, Lever, LinkedIn, Workday)
  // render their content with JavaScript, so a plain fetch sees only a shell with
  // no apply button. Staying "unknown" is correct here — guessing "closed" used to
  // mass-mislabel open postings as rejected.
  return { available: null, reason: 'Could not determine (page likely renders client-side)' }
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // SSRF-guarded, but still a server-side fetcher of user URLs — throttle per IP
  // so it can't be used as an unbounded URL-probing oracle.
  const { ok, retryAfter } = rateLimit({ key: `check-position:${getClientIp(req)}`, limit: 30, windowMs: 60_000 })
  if (!ok) {
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({ error: 'Too many requests. Please slow down.' })
  }

  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'Missing URL' })
  }

  // SSRF guard: only allow public http(s) URLs (blocks internal/metadata hosts).
  let safeUrl
  try {
    safeUrl = await assertSafeUrl(url)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  try {
    const urlObj = new URL(safeUrl)

    // Timeout after 10 seconds
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    // safeFetch follows redirects manually, re-validating each hop, so a public
    // URL can't redirect into a private/metadata host (SSRF bypass).
    const response = await safeFetch(safeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    clearTimeout(timeout)

    // Handle status codes
    if (response.status === 404) {
      return res.json({ available: false, reason: '404 Not Found', statusCode: 404 })
    }

    if (response.status >= 400) {
      return res.json({ available: null, reason: `HTTP ${response.status}`, statusCode: response.status })
    }

    // Read response body (limit to 1MB)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
      return res.json({ available: null, reason: 'Not HTML content' })
    }

    const text = await response.text()
    const maxLength = 1024 * 1024 // 1MB
    const content = text.slice(0, maxLength)

    const stripped = stripHtml(content)
    const result = detectAvailability(stripped)

    return res.json({
      available: result.available,
      reason: result.reason,
      statusCode: response.status,
      domain: urlObj.hostname,
    })
  } catch (error) {
    // Timeout or network error
    if (error.name === 'AbortError') {
      return res.json({ available: null, reason: 'Request timeout' })
    }

    console.error('Check position error:', error.message)
    return res.json({ available: null, reason: 'Network error: ' + error.message })
  }
}
