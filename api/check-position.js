const CLOSED_INDICATORS = [
  'position closed', 'job closed', 'this position is closed',
  'application closed', 'applications closed',
  'this position has been filled', 'position filled', 'position has been filled',
  'no longer accepting applications', 'no longer hiring',
  'this position is no longer available', 'position no longer available',
  'already filled', 'this role has been filled',
  'this job has been filled', 'job has been filled',
  'we are no longer accepting', 'we\'re no longer accepting',
  'position not available', 'not available',
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

  // Check for 404 or similar in content (strong closed signal)
  if (lower.includes('404') || lower.includes('not found') || lower.includes('page not found')) {
    return { available: false, reason: 'Page not found (404)' }
  }

  // Check for closed indicators (high confidence)
  let closedScore = 0
  for (const indicator of CLOSED_INDICATORS) {
    if (lower.includes(indicator)) closedScore++
  }

  // Check for open indicators
  let openScore = 0
  for (const indicator of OPEN_INDICATORS) {
    if (lower.includes(indicator)) openScore++
  }

  // Decision logic
  if (closedScore >= 1) {
    // If we found ANY closed indicator, assume closed (conservative approach)
    return { available: false, reason: `Detected: position closed` }
  }

  if (openScore >= 2) {
    // Need at least 2 open indicators to confirm available
    return { available: true, reason: 'Found apply/career indicators' }
  }

  // Heuristic: if page has job title/description but no apply button, likely closed
  const hasJobContent = /job|position|role|title|description|requirement/i.test(content)
  const hasApply = /apply|candidate|apply now|apply here|easy apply|apply to|candidat/i.test(content)

  if (hasJobContent && !hasApply) {
    return { available: false, reason: 'No apply button found (likely closed)' }
  }

  // Default: unknown (couldn't determine)
  return { available: null, reason: 'Could not determine (no clear indicators)' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'Missing URL' })
  }

  try {
    // Validate URL
    const urlObj = new URL(url)

    // Timeout after 10 seconds
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
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
