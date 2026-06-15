// CV ↔ job-description match scoring.
// Routed through the generic /api/claude proxy (instead of a dedicated serverless
// function) to stay under Vercel's Hobby-plan 12-function limit.

function buildPrompt({ cvText, jobDescription, company, position }) {
  return `You are an expert recruiter and CV screener. Analyze how well the candidate's CV matches the job description.

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
}

function extractJSON(rawText) {
  let jsonText = rawText || '{}'
  if (jsonText.includes('```json')) {
    jsonText = jsonText.split('```json')[1]?.split('```')[0] || rawText
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.split('```')[1]?.split('```')[0] || rawText
  }
  return JSON.parse(jsonText.trim())
}

/**
 * Score how well a CV matches a job description.
 * @returns {Promise<{score, summary, strengths, gaps, verdict, scoredAt}>}
 * @throws on network/API/parse failure
 */
export async function scoreJobMatch({ cvText, jobDescription, company, position }) {
  if (!cvText || !jobDescription) throw new Error('cvText and jobDescription required')

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: buildPrompt({ cvText, jobDescription, company, position }) }],
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Claude API ${res.status}`)

  const rawText = data.content?.[0]?.text || '{}'
  const result = extractJSON(rawText)

  return {
    score: result.score || 0,
    summary: result.summary || '',
    strengths: result.strengths || [],
    gaps: result.gaps || [],
    verdict: result.verdict || 'PARTIAL_MATCH',
    scoredAt: new Date().toISOString(),
  }
}
