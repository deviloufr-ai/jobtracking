// Extract all URLs from email body
export function extractUrlsFromEmail(emailBody) {
  if (!emailBody) return []

  // Match http/https URLs + common ATS domains without protocol
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+|(?:www\.|apply\.|careers\.|jobs\.)[^\s<>"{}|\\^`\[\]]+/gi

  const urls = new Set()
  let match

  while ((match = urlRegex.exec(emailBody)) !== null) {
    let url = match[0]
    // Add https:// if missing
    if (!url.startsWith('http')) {
      url = 'https://' + url
    }
    // Filter out common false positives
    if (!url.includes('unsubscribe') && !url.includes('privacy') && !url.includes('settings')) {
      try {
        const u = new URL(url)
        // Prefer URLs with "apply", "job", "position", "candidate" in them
        urls.add(url)
      } catch {
        // Invalid URL, skip
      }
    }
  }

  return Array.from(urls)
}

// Score URLs by relevance to job applications
export function rankUrlsByJobRelevance(urls) {
  const jobKeywords = ['apply', 'job', 'position', 'candidate', 'application', 'career', 'recruit', 'hire', 'greenhouse', 'lever', 'workable']

  return urls.sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()

    let aScore = 0
    let bScore = 0

    for (const keyword of jobKeywords) {
      if (aLower.includes(keyword)) aScore++
      if (bLower.includes(keyword)) bScore++
    }

    // ATS platforms are highest priority
    const ATSPlatforms = ['greenhouse', 'lever', 'workable', 'ashby', 'smartrecruiters']
    for (const ats of ATSPlatforms) {
      if (aLower.includes(ats)) aScore += 5
      if (bLower.includes(ats)) bScore += 5
    }

    return bScore - aScore
  })
}

// Check if a URL is still available
export async function checkPositionUrl(url) {
  try {
    const res = await fetch('/api/check-position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const data = await res.json()
    return {
      url,
      available: data.available,
      reason: data.reason,
      checkedAt: new Date().toISOString(),
      domain: data.domain,
    }
  } catch (e) {
    return {
      url,
      available: null,
      reason: 'Check failed: ' + e.message,
      checkedAt: new Date().toISOString(),
    }
  }
}

// Extract top N job-relevant URLs from email
export async function extractJobUrlsFromEmail(emailBody, topN = 3) {
  const urls = extractUrlsFromEmail(emailBody)
  const ranked = rankUrlsByJobRelevance(urls)
  return ranked.slice(0, topN)
}
