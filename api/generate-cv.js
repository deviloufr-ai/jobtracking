import { applyCors, getClientIp, rateLimit } from './_lib/http.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `generate-cv:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

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
          content: `You are an expert CV writer and ATS specialist. Adapt this CV for the "${position}" role at "${company}".

${language === 'auto'
  ? 'DETECT the language of the job description and write the ENTIRE CV in THAT language.\nFrench JD → French CV. English JD → English CV.'
  : language === 'fr'
  ? 'Write the ENTIRE CV in FRENCH.'
  : 'Write the ENTIRE CV in ENGLISH.'}

═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE:
═══════════════════════════════════════════════════════════════════════════════
✓ KEEP ALL experiences from the original CV — no removal, no consolidation
✓ ADAPT the language and bullets to highlight relevance to this job
✓ DO NOT INVENT — use only actual achievements from the original CV
✓ REORDER content to put most relevant experience first
✓ MAKE IT VISUALLY ATTRACTIVE while staying ATS-compatible

═══════════════════════════════════════════════════════════════════════════════
STRICT FORMAT RULES — ATS-Compatible:
═══════════════════════════════════════════════════════════════════════════════
1. # Full Name
2. Contact line: City · Email · Phone · LinkedIn (plain text, NO symbols)
3. ## Section Title (use standard names: Professional Experience, Technical Skills, Education, etc.)
4. ### Job Title (e.g., Senior Product Manager)
5. Company Name | Start Date – End Date | Location (pipe-separated, single line)
6. - Bullet point (action verb + quantified result when available)
7. Blank line after each role (before next ###)
8. **Skills**: Listed by category or comma-separated
9. NO icons, boxes, colors (except **bold** for emphasis), images, or special Unicode characters

═══════════════════════════════════════════════════════════════════════════════
CONTENT ADAPTATION (NOT INVENTION):
═══════════════════════════════════════════════════════════════════════════════

For EACH experience in original CV:
1. Keep the role title, company, dates, location as-is (factual)
2. Adapt bullet descriptions to highlight JD relevance
3. Reorder bullets: put most relevant to this job FIRST
4. Keep original achievements — do NOT add new ones
5. Example adaptation (not invention):
   ORIGINAL: "Led product roadmap using OKR framework"
   ADAPTED for job seeking "OKR + strategy" role: "Led product roadmap using OKR framework, driving quarterly planning and cross-functional alignment"
   NOT INVENTED: "Led product roadmap using OKR framework and increased revenue by 50%" (if not in original)

Profile/Summary:
- 2-3 sentences (50-80 words)
- Tailor to highlight skills matching top JD requirements
- Use keywords from job description
- Stay truthful to original CV context

Job Description Keyword Integration:
- Extract top 8-10 skills/keywords from the JD
- Use in Profile, section headers, bullet language
- Front-load matching skills in bullets
- Example: If JD emphasizes "mobile-first product strategy," reorder bullets to lead with mobile work

Skills Section:
- Reorder to put JD-matching skills FIRST
- Keep all original skills from CV
- Add context where relevant (e.g., "Product Discovery — User research, A/B testing, OKR")

Education & Other:
- Keep exactly as in original CV
- No changes needed

═══════════════════════════════════════════════════════════════════════════════
ATS PARSER RULES (Non-negotiable):
═══════════════════════════════════════════════════════════════════════════════
- Dates: "Month Year" format (Jan 2023, May 2025)
- Locations: "City, Country" (Tokyo, Remote (Europe/Asia))
- Role titles: Standard job titles, no creative wording
- Company names: Exact names, no abbreviations
- No Unicode bullets (use standard ASCII "-")
- No complex indentation or tables
- Single column layout only

═══════════════════════════════════════════════════════════════════════════════
VISUAL OPTIMIZATION (while staying ATS-safe):
═══════════════════════════════════════════════════════════════════════════════
- Clear section hierarchy with consistent formatting
- Company names and dates on same line (easier to scan)
- 3-4 bullets per role (2-3 for shorter roles, more for extensive ones)
- Bullets use strong action verbs at start: Led, Drove, Built, Scaled, Improved, Launched, etc.
- No unnecessary bullet points — only impactful achievements
- Skills section organized for easy scanning

═══════════════════════════════════════════════════════════════════════════════
FINAL INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════════════════

ORIGINAL CV (full, keep ALL experiences):
${cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription}

OUTPUT:
Return ONLY the Markdown CV (no preamble, no comments, no "Here's your CV:").
Multi-page is fine — use as much space as needed to show all experience.
Focus on: honest adaptation, visual clarity, ATS compatibility.`
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
