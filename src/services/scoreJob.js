// CV ↔ job-description match scoring.
// Routed through the generic /api/claude proxy (instead of a dedicated serverless
// function) to stay under Vercel's Hobby-plan 12-function limit.
import { aiFetch } from './apiKey'
import { CLAUDE_MODEL } from '../constants/aiModel'
import { normalizeScoreResult } from '../utils/scoreMatch'
import { getAppLanguage } from '../utils/appLanguage'

// Output language of the score prose. The UI language (not the JD's, unlike CV
// generation which follows the posting) — the summary/strengths/gaps are read by
// the user in the app, and without an instruction the model answered in English
// or in the JD's language for FR users.
const LANG_NAMES = { fr: 'French', en: 'English' }
function outputLanguageName(language) {
  return LANG_NAMES[language] || LANG_NAMES[getAppLanguage()] || 'English'
}

// Twin of the prompt in jobtrackr-extension/background.js computeMatchScore —
// keep in sync.
function buildPrompt({ cvText, jobDescription, company, position, language }) {
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

Write "summary", "strengths" and "gaps" in ${outputLanguageName(language)}, whatever the language of the CV or the job description.

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
 * @param {object} args
 * @param {'fr'|'en'} [args.language] output language of the prose; defaults to the UI language
 * @returns {Promise<{score, summary, strengths, gaps, verdict, scoredAt}>}
 * @throws on network/API/parse failure
 */
export async function scoreJobMatch({ cvText, jobDescription, company, position, language }) {
  if (!cvText) throw new Error('No CV to score against — upload a CV first.')
  if (!jobDescription || !jobDescription.trim()) throw new Error('No job description on this job — add one first.')

  // aiFetch attaches the user's key, and on a 402 signals trial-exhausted + throws
  // TrialExhaustedError so the "add your Claude key" prompt fires (plain fetch used
  // to swallow this into a generic error and the prompt never appeared).
  const res = await aiFetch('/api/claude', {
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: buildPrompt({ cvText, jobDescription, company, position, language }) }],
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Claude API ${res.status}`)

  const rawText = data.content?.[0]?.text || '{}'
  // normalizeScoreResult throws on a missing/non-numeric score (so a malformed
  // answer is a failed call, never a stored "0"), clamps to 0-100 and derives the
  // verdict from the score so badge colour and verdict text always agree.
  const result = normalizeScoreResult(extractJSON(rawText))

  return { ...result, scoredAt: new Date().toISOString() }
}
