import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `generate-cv:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

  const userKey = req.body?.apiKey?.trim()
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }
  if (!userKey) {
    const quota = await enforceSharedKeyQuota(req)
    if (!quota.ok) { res.status(402).json({ error: 'Free trial used up. Add your own Claude API key in Settings to keep using the AI features.', code: 'TRIAL_EXHAUSTED' }); return }
  }

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
✓ RUTHLESSLY PRIORITIZE: Select TOP 3-5 most recent/relevant roles only (NOT all roles)
✓ ADAPT the language and bullets to highlight relevance to this job
✓ DO NOT INVENT — use only actual achievements from the original CV
✓ REORDER content to put most relevant experience first
✓ 2-PAGE MAXIMUM: This is non-negotiable. Cut aggressively to fit.

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
TONE & LANGUAGE (Make it sound naturally human, not AI-polished):
═══════════════════════════════════════════════════════════════════════════════
- AVOID: Repetitive structure where every bullet = "Led X, drove Y, resulting in Z%"
- AVOID: Corporate jargon overload (synergy, leverage, optimize obsessively)
- AVOID: Every bullet has a metric—mix quantitative + qualitative outcomes
- DO: Vary sentence structure (some short, some longer; some start with action verb, some with context)
- DO: Use specific details/context that feels genuine (not generic)
- DO: Balance precise metrics with human-scale observations ("faster feedback loops", "team morale improved")
- DO: Sound like a real person reflecting on what they actually did

Example (HUMAN, not AI-obvious):
BAD (AI-obvious): "Led cross-functional team, implemented A/B testing framework, resulting in 23% conversion improvement"
GOOD (human): "Built A/B testing framework from scratch—took time to teach the team stats, but we caught 3 major UX issues that were killing conversions"
ALSO GOOD: "Owned product roadmap for 18-month cycle; shipped features we knew users actually wanted (80% adoption, not lab metrics)"

═══════════════════════════════════════════════════════════════════════════════
ROLE SELECTION ALGORITHM (CRITICAL — this determines page count):
═══════════════════════════════════════════════════════════════════════════════

STEP 1: EXCLUDE roles to fit 2 pages
- Remove ALL roles older than 8 years (unless directly required by JD)
- If still too long, remove roles 5-8 years old with low JD relevance
- RESULT: Keep ONLY 3-5 most recent + most relevant roles

STEP 2: For SELECTED roles only (not all):
1. Keep role title, company, dates, location as-is (factual)
2. Adapt bullet descriptions to highlight JD relevance
3. Reorder bullets: put most relevant to job FIRST
4. Keep original achievements — do NOT add new ones
5. Vary phrasing (not all bullets follow same pattern)
6. Example adaptations (HUMAN, not AI-obvious):
   ORIGINAL: "Led product roadmap using OKR framework"
   ADAPTED (specific): "Ran quarterly OKR planning cycles—wrote outcomes, partnered with eng to validate, shipped ~8 features per cycle"
   or: "Managed product roadmap via OKRs; this meant saying no to 60% of feature requests, but improved ship quality"
   NOT: "Led OKR-driven roadmap, delivering features with 92% on-time delivery" (too templated)

Profile/Summary:
- 2-3 sentences (60-90 words max) — absolutely NO longer
- Lead with operating model/scope (OKR-driven, data-informed, etc.), not just years of experience
- Sound CONVERSATIONAL, not like a robot wrote it (e.g., "shipped 40+ features" beats "led feature delivery initiatives")
- Use 4-6 top keywords from job description, but naturally woven in
- Stay truthful to original CV context
- Example (HUMAN): "Product Manager focused on shipping what users actually need. 10 years in B2B SaaS—worked with teams to validate ideas before building, which cut wasted effort in half."
- Example (TOO AI): "Strategic Product Manager with expertise in user-centric discovery, data-driven roadmap prioritization, and cross-functional team alignment across B2B SaaS verticals."

Job Description Keyword Integration:
- Extract top 8-10 skills/keywords from the JD
- Use in Profile, section headers, bullet language
- Front-load matching skills in bullets
- Example: If JD emphasizes "mobile-first product strategy," reorder bullets to lead with mobile work

Skills Section:
- SELECT TOP 10-12 JD-MATCHING SKILLS ONLY (cut generic/outdated skills)
- Organize by category, put most JD-relevant category first
- Add brief proof/context that sounds natural: "Product Discovery — user interviews, A/B testing, prioritization frameworks"
- Vary the format slightly (not every line identical structure)
- Example (HUMAN): "Product Strategy: OKR planning, roadmap prioritization, competitive analysis"
- Example (TOO AI): "Strategic Product Management: OKR framework implementation, data-driven roadmap optimization, competitive landscape analysis"
- Remove: soft skills (communication, leadership) unless specifically required by JD

Education:
- Single line format ONLY: "BS Computer Science, MIT | JLPT N1"
- Remove: certifications, coursework, honors (unless explicitly required by JD)
- No separate "Education" section if 1 line — fold into contact/header area

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
LENGTH OPTIMIZATION (STRICT 2-PAGE MAXIMUM):
═══════════════════════════════════════════════════════════════════════════════
**NON-NEGOTIABLE: Output must fit on 2 pages max. Cut aggressively.**

Role selection:
- Include ONLY top 3-5 most recent/relevant roles (cut anything 8+ years old)
- If original CV has 8+ roles: SELECT the 3-4 most relevant to JD + most recent role
- Do NOT include all roles "for completeness"

Bullet count per role:
- Recent role (last 3 years): 3 bullets MAX
- Older role (3-8 years): 2 bullets only
- Oldest role (8+ years): 1 bullet or EXCLUDE

Skills section:
- Top 10 JD keywords only (organized by category)
- Total skills section: max 4 lines

Education:
- 1 line only: "Degree, School | Certifications" (if competitive)

Example 2-page budget:
- Header/Profile: 4 lines
- Experience (3-4 roles, 3+3+3+2 bullets): 14 lines
- Skills (top 10, 1 category): 3 lines
- Education: 1 line
TOTAL: ~22 lines = 1.8 pages

**If current CV exceeds this, REMOVE older roles first, then condense bullets to 2 per role.**

═══════════════════════════════════════════════════════════════════════════════
FINAL INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════════════════

ORIGINAL CV (reference for role selection and bullet content):
${cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription}

OUTPUT REQUIREMENTS:
1. Return ONLY the Markdown CV (no preamble, no comments, no "Here's your CV:")
2. **MAXIMUM 2 PAGES** — this is hard limit, non-negotiable
3. Include ONLY 3-4 roles (select top 3-4 by recency + JD relevance; EXCLUDE all others)
4. Bullets per role: 3 max for recent roles (last 5 years), 2 max for older roles
5. Every bullet has measurable result/outcome (no process-only language)
6. Profile: 2-3 sentences, leads with operating model, 60-90 words max
7. Skills: top 10 JD keywords only, organized by category with proof
8. Education: 1 line only (degree | certifications), or omit if not relevant
9. CRITICAL: If output exceeds 2 pages during generation, DELETE the oldest/least relevant role and regenerate

Priority order (in order):
1. Fit on 2 pages (CRITICAL — cut roles if needed)
2. Show JD relevance (CRITICAL — front-load matching keywords)
3. Include measurable outcomes (CRITICAL — every bullet has metrics)
4. Maintain ATS compatibility (important)`
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
