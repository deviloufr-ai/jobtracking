import { setupCORS } from './cors-helper.js'

export default async function handler(req, res) {
  if (setupCORS(req, res)) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  const { cvText, jobDescription, company, position, language } = req.body
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
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert CV writer and recruiter. Adapt this CV for the "${position}" role at "${company}".

${language === 'auto'
  ? 'DETECT the language of the job description and write the ENTIRE CV in THAT language.\nFrench JD → French CV. English JD → English CV.'
  : language === 'fr'
  ? 'Write the ENTIRE CV in FRENCH.'
  : 'Write the ENTIRE CV in ENGLISH.'}

STRICT FORMAT RULES — ATS-Compatible:
1. # Full Name  (h1, one line only)
2. Contact: Email · Phone · Location · LinkedIn (plain text, no # prefix)
3. ## Section Title  (h2 for each section — use standard names)
4. ### Job Title  (h3 for each role — e.g., "Senior Product Manager")
5. Company Name | Dates | Location  (single plain text line, pipe-separated)
6. - Achievement bullet  (start each with action verb + metric/result when possible)
7. Blank line between each experience block
8. Use ONLY standard fonts (no icons, no boxes, no colors except text/bold)

CONTENT RULES — ATS & Recruiter Optimized:
- **Profile/Summary**: Write 1-2 sentences ONLY (40-60 words). Lead with title match + top differentiator.
- **Keywords**: Front-load job description keywords into the profile, experience titles, and bullets
- **Bullets**: Use action verbs (Led, Drove, Built, Scaled, Improved) + quantified results. Keep sentences under 15 words each.
- **Experience**: Include ONLY 3-4 most relevant roles. For each: Title | Company | Dates on line 1, then 3-4 achievement bullets (no more)
- **Match Job Requirements**: Prioritize bullets matching top 5 keywords/skills from the job offer. Cut anything not relevant.
- **Skills Section**: List ONLY skills mentioned in the JD. Max 5 skill categories, 3-4 items each. Total ~80 words.
- **Formatting for ATS**: No special characters, images, or complex styling. Standard fonts only.
- **STRICT LENGTH LIMITS (FIT ONE PAGE)**:
  - Profile: 40-60 words
  - Each role: 3-4 bullets, ~15 words per bullet (total 60-80 words per role)
  - 3-4 roles total: 180-320 words
  - Skills: 80-100 words
  - Total target: 300-480 words (fits cleanly on one page)
- **Do NOT**:
  - Invent new experiences, skills, or certifications
  - Use graphics, icons, or columns (ATS cannot parse)
  - Repeat the same achievement twice
  - Include roles not relevant to the position
  - Write bullets longer than 15 words

RECRUITER SPEED-READ (First 10 seconds):
- Name at top
- Profile line: 1-2 sentences with role title + experience level + top 2-3 differentiators
- Most recent/relevant experience first
- Highlight 2-3 biggest wins (revenue growth, user acquisition, efficiency gains, etc.)
- Skills list: put required JD skills at the top

ORIGINAL CV:
${cvText.slice(0, 12000)}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription.slice(0, 12000)}

Return ONLY the Markdown CV, no preamble, no comments.`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const generatedCV = data.content?.[0]?.text || ''
    res.status(200).json({ cv: generatedCV })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
