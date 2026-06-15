import { applyCors, getClientIp, rateLimit } from './_lib/http.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `score-job:${getClientIp(req)}`, limit: 30, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  const { cvText, jobDescription, company, position } = req.body
  if (!cvText || !jobDescription) {
    res.status(400).json({ error: 'cvText and jobDescription required' }); return
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are an expert recruiter and CV screener. Analyze how well the candidate's CV matches the job description.

CANDIDATE CV:
${cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription}

Evaluate the candidate's fit across these dimensions:
1. Required Skills Match (must-have technical/soft skills from JD)
2. Experience Level (years, seniority, relevant domain)
3. Background Alignment (industry, company size, role similarity)
4. Achievement Relevance (measurable outcomes matching JD context)

Respond with ONLY a JSON object (no markdown, no preamble) with this exact structure:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence assessment>",
  "strengths": ["<key strength>", "<key strength>"],
  "gaps": ["<missing skill/experience>", "<gap>"],
  "verdict": "<STRONG_MATCH|GOOD_MATCH|PARTIAL_MATCH|WEAK_MATCH>"
}`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text || '{}'

    // Parse JSON — strip markdown if present
    let jsonText = rawText
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1]?.split('```')[0] || rawText
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1]?.split('```')[0] || rawText
    }

    const result = JSON.parse(jsonText.trim())

    res.status(200).json({
      score: result.score || 0,
      summary: result.summary || '',
      strengths: result.strengths || [],
      gaps: result.gaps || [],
      verdict: result.verdict || 'PARTIAL_MATCH',
      scoredAt: new Date().toISOString()
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
