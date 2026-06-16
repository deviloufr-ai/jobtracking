export async function extractCompanyAddress(company, description, url, apiKey) {
  if (!description && !url) return null
  if (!apiKey) throw new Error('Claude API key required')

  let content = description || ''

  // If no description but URL provided, try to fetch
  if (!content && url) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      if (response.ok) {
        const html = await response.text()
        content = html.slice(0, 3000)
      }
    } catch (e) {
      console.warn('Failed to fetch URL:', e.message)
    }
  }

  if (!content) return null

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `Extract the office/work location address from job postings.
Return ONLY the address (e.g., "123 Main St, Paris, France").
If no address found, return "NOT_FOUND".`,
        messages: [{
          role: 'user',
          content: `Company: ${company}\n\nExtract the address from:\n${content}`
        }]
      })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'Failed to extract')

    const address = data.content[0]?.text?.trim()
    return address === 'NOT_FOUND' ? null : address
  } catch (error) {
    console.error('Address extraction error:', error)
    throw error
  }
}
