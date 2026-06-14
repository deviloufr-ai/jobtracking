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
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: `You are an expert CV writer and ATS specialist. Generate a ONE-PAGE CV adapted for the "${position}" role at "${company}".

${language === 'auto'
  ? 'DETECT the language of the job description and write the ENTIRE CV in THAT language.\nFrench JD → French CV. English JD → English CV.'
  : language === 'fr'
  ? 'Write the ENTIRE CV in FRENCH.'
  : 'Write the ENTIRE CV in ENGLISH.'}

═══════════════════════════════════════════════════════════════════════════════
ONE-PAGE REQUIREMENT (CRITICAL):
═══════════════════════════════════════════════════════════════════════════════
This CV MUST fit on a single A4 page when printed at 10-11pt font with 12mm margins.

Content strategy:
1. Use ALL experience from original CV, but select the 5-6 most relevant roles for this position
2. For older/less relevant roles: 1-2 bullets maximum (proof of experience, not detail)
3. For recent/highly relevant roles: 2-3 bullets maximum (focused on role match)
4. Consolidate older roles (pre-2015): combine under one entry if similar discipline
5. Cut: promotions, minor projects, roles unrelated to target position
6. Keep: achievements with quantified results, leadership, cross-functional work

═══════════════════════════════════════════════════════════════════════════════
STRICT FORMAT RULES — ATS-Compatible:
═══════════════════════════════════════════════════════════════════════════════
1. # Full Name
2. Contact line: City · Email · Phone · LinkedIn (plain text, semicolon or dot separator, NO symbols)
3. ## Section Title (use standard names: Professional Experience, Technical Skills, Education, etc.)
4. ### Job Title (e.g., Senior Product Manager)
5. Company Name | Start Date – End Date | Location (pipe-separated, single line)
6. - Bullet point (action verb + quantified result, max 12 words per bullet)
7. Blank line after each role (before next ###)
8. **Skills**: Listed inline or as comma-separated, alphabetical by relevance to JD
9. NO icons, boxes, colors (except **bold** for emphasis), images, or special Unicode characters

═══════════════════════════════════════════════════════════════════════════════
CONTENT OPTIMIZATION:
═══════════════════════════════════════════════════════════════════════════════

Profile/Summary (if included):
- 1-2 sentences ONLY (30-50 words)
- Start with title + years of experience
- Highlight top 1-2 differentiators matching this role
- Example: "Senior Product Manager with 15+ years scaling B2B SaaS. Expert in OKR-driven roadmaps and data-driven prioritization."

Experience Bullets:
- Front-load with action verbs: Led, Drove, Built, Scaled, Improved, Launched, Grew, Delivered, Managed
- Follow with: [what] [impact] [metric] in [timeframe]
- Examples:
  ✓ "Led $2.5M product pivot, achieving 40% user growth in 6 months"
  ✓ "Reduced feature time-to-market from 12 to 7 weeks via cross-functional framework"
  ✗ "Responsible for roadmap prioritization" (vague, no result)

Job Description Keyword Integration:
- Extract top 8-10 skills/keywords from the JD
- Front-load these into: Profile, job titles, bullet keywords
- Example JD keywords: "OKR, A/B testing, SQL, metrics, Figma" → weave into bullets and skills list

Skills Section:
- List TOP JD-required skills first (in order of relevance to position)
- Then add original CV skills that strengthen candidacy
- Format: **Category**: skill1, skill2, skill3 OR inline comma-separated list
- Limit to 15-20 total skills (not every skill, only impactful ones)

Education:
- School Name · Degree (Major, if relevant to role)
- Only include if degree is relevant or prestigious
- No GPA, no graduation dates (unless recent grad)

═══════════════════════════════════════════════════════════════════════════════
ATS PARSER RULES (Non-negotiable):
═══════════════════════════════════════════════════════════════════════════════
- Dates in format: "Month Year" or "Jan 2023" (NOT "2023-01" or "1/2023")
- Locations: "City, Country" (NOT just country, NOT abbreviations like "NYC" for ATS)
- Role titles: use standard job titles (not creative ones like "Growth Wizard")
- Company names: exact legal name, no abbreviations
- No Unicode bullets (use standard ASCII "-" for bullets)
- No tabs or complex indentation
- Single column layout only (no tables, no sidebars)

═══════════════════════════════════════════════════════════════════════════════
RECRUITER SPEED-READ (First 15 seconds):
═══════════════════════════════════════════════════════════════════════════════
- Name at top (clear, professional)
- Contact info: findable immediately
- Profile summary: 1-2 sentences with role match + key insight
- Most recent + most relevant role FIRST
- Top 2-3 achievements: quantified wins (revenue, users, efficiency, time saved)
- Skills: JD keywords prominently placed
- → Goal: Recruiter sees role match within 15 seconds

═══════════════════════════════════════════════════════════════════════════════
FINAL INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════════════════

ORIGINAL CV (full):
${cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription}

OUTPUT:
Return ONLY the Markdown CV (no preamble, no comments, no "Here's your CV:").
Ensure the output is structured, concise, and fits ONE A4 page when rendered at 10-11pt.`
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
