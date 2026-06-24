import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'

// Target ATS / job-match score the generated CV must reach. The handler
// generates, self-scores with the same rubric the in-app scorer uses, and
// refines with targeted feedback until the CV clears this bar (or runs out
// of attempts).
const TARGET_SCORE = 90
const MAX_ATTEMPTS = 3 // 1 initial generation + up to 2 refinement passes

async function callClaude(apiKey, { maxTokens, prompt }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Claude API ${response.status}`)
  }
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

function buildGeneratePrompt({ cvText, jobDescription, company, position, languageInstruction, feedback }) {
  const feedbackBlock = feedback ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REVISION REQUIRED — the previous draft scored ${feedback.score}/100 (target ≥ ${TARGET_SCORE}).
═══════════════════════════════════════════════════════════════════════════════
A recruiter-style screener flagged these GAPS against the job description:
${(feedback.gaps || []).map(g => `- ${g}`).join('\n')}

Close every gap above WITHOUT inventing experience the candidate doesn't have:
- Surface real, relevant experience already in the original CV that addresses each gap (it may be buried in an older role).
- Mirror the EXACT skill/keyword wording used in the job description (same terms, same casing) wherever the candidate truthfully has that experience.
- Front-load the matching keywords in the Profile, the Skills section, and the first bullet of the most relevant roles.
- If a gap is a genuine hard requirement the candidate lacks, emphasise the closest transferable experience instead — never fabricate.
` : ''

  return `You are an expert CV writer and ATS specialist. Adapt this CV for the "${position}" role at "${company}".

${languageInstruction}

═══════════════════════════════════════════════════════════════════════════════
PRIMARY OBJECTIVE — ATS / JOB-MATCH SCORE ≥ ${TARGET_SCORE} / 100:
═══════════════════════════════════════════════════════════════════════════════
The adapted CV will be graded by an automated recruiter-style screener on:
  1. Required-skills match (must-have skills/keywords from the JD)
  2. Experience level (years, seniority, relevant domain)
  3. Background alignment (industry, company size, role similarity)
  4. Achievement relevance (measurable outcomes matching the JD context)
Your CV MUST score at least ${TARGET_SCORE}. To get there, truthfully mirror the JD's
must-have keywords/skills (same wording) anywhere the candidate genuinely has that
experience, and front-load that relevance. NEVER fabricate — pull from real history.
${feedbackBlock}
═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE:
═══════════════════════════════════════════════════════════════════════════════
✓ INCLUDE EVERY ROLE from the original CV — do NOT drop or omit any experience
✓ ADAPT the language and bullets to highlight relevance to this job
✓ DO NOT INVENT — use only actual achievements from the original CV
✓ EMPHASIZE the most relevant experience (more bullets), but still list every role
✓ CONDENSE older/less relevant roles to fewer bullets — never delete them

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
ROLE COVERAGE (CRITICAL):
═══════════════════════════════════════════════════════════════════════════════

STEP 1: KEEP EVERY ROLE from the original CV
- Do NOT remove or omit any role, no matter how old
- Allocate bullet count by relevance/recency (see LENGTH section), not by inclusion/exclusion
- The most recent and most JD-relevant roles get the most detail; older roles get condensed to 1-2 bullets

STEP 2: For EVERY role:
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
LENGTH OPTIMIZATION (condense, never delete):
═══════════════════════════════════════════════════════════════════════════════
**Keep the CV concise, but include EVERY role. Manage length by adjusting bullet
count per role — NOT by removing roles. Let the CV run to 3 pages if needed to
cover the full career history.**

Bullet count per role (allocate by relevance/recency):
- Recent role (last 3 years): up to 4 bullets
- Mid role (3-8 years): 2-3 bullets
- Older role (8+ years): 1-2 bullets (condensed, but still present)

Skills section:
- Top 10-12 JD keywords (organized by category)

Education:
- 1 line only: "Degree, School | Certifications" (if competitive)

**If the CV feels long, TRIM BULLETS on older roles down to a single line — do
NOT drop any role.**

═══════════════════════════════════════════════════════════════════════════════
FINAL INSTRUCTIONS:
═══════════════════════════════════════════════════════════════════════════════

ORIGINAL CV (reference for role selection and bullet content):
${cvText}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription}

OUTPUT REQUIREMENTS:
1. Return ONLY the Markdown CV (no preamble, no comments, no "Here's your CV:")
2. **INCLUDE EVERY ROLE from the original CV** — do NOT omit any experience
3. Bullets per role: up to 4 for recent roles, 2-3 for mid roles, 1-2 for older roles
4. Most bullets should have a measurable result/outcome (mix in qualitative ones too)
5. Profile: 2-3 sentences, leads with operating model, 60-90 words max
6. Skills: top 10-12 JD keywords, organized by category with proof
7. Education: 1 line only (degree | certifications), or omit if not relevant
8. CRITICAL: If the CV is long, CONDENSE bullets on older roles — never delete a role

Priority order (in order):
1. Score ≥ ${TARGET_SCORE} on JD relevance — truthfully mirror must-have keywords (CRITICAL)
2. Cover the FULL career history — every role present (CRITICAL)
3. Include measurable outcomes where available
4. Maintain ATS compatibility (important)`
}

// Mirrors the rubric in src/services/scoreJob.js so the self-check matches what
// the in-app "Job Match Score" reports.
function buildScorePrompt({ cv, jobDescription, company, position }) {
  return `You are an expert recruiter and CV screener. Analyze how well the candidate's CV matches the job description.

CANDIDATE CV:
${cv}

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
  "verdict": "<STRONG_MATCH|GOOD_MATCH|PARTIAL_MATCH|WEAK_MATCH>",
  "gaps": ["<missing skill/keyword the CV should surface>", "<gap>"]
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

async function scoreCV(apiKey, { cv, jobDescription, company, position }) {
  const raw = await callClaude(apiKey, {
    maxTokens: 600,
    prompt: buildScorePrompt({ cv, jobDescription, company, position }),
  })
  try {
    const parsed = extractJSON(raw)
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      verdict: parsed.verdict || 'PARTIAL_MATCH',
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    }
  } catch {
    // If scoring fails to parse, don't block the generation — treat as unknown.
    return { score: null, verdict: null, gaps: [] }
  }
}

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

  const LANGUAGE_INSTRUCTIONS = {
    auto: 'DETECT the language of the job description and write the ENTIRE CV in THAT language.\nFrench JD → French CV. English JD → English CV. Japanese JD → Japanese CV.',
    fr: 'Write the ENTIRE CV in FRENCH.',
    en: 'Write the ENTIRE CV in ENGLISH.',
    jp: 'Write the ENTIRE CV in JAPANESE (日本語). Use natural business Japanese (敬語/丁寧語) appropriate for a professional 職務経歴書.',
  }
  const languageInstruction = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.auto

  try {
    let bestCV = ''
    let bestScore = -1
    let bestVerdict = null
    let feedback = null

    // Generate → self-score → refine until the CV clears TARGET_SCORE, keeping
    // the highest-scoring draft seen across attempts.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const cv = await callClaude(apiKey, {
        maxTokens: 8000,
        prompt: buildGeneratePrompt({ cvText, jobDescription, company, position, languageInstruction, feedback }),
      })

      const { score, verdict, gaps } = await scoreCV(apiKey, { cv, jobDescription, company, position })

      // Scoring unavailable (parse failure) — return this draft as-is.
      if (score === null) {
        bestCV = bestCV || cv
        bestScore = bestScore < 0 ? null : bestScore
        bestVerdict = bestVerdict || verdict
        break
      }

      if (score > bestScore) {
        bestCV = cv
        bestScore = score
        bestVerdict = verdict
      }

      if (score >= TARGET_SCORE) break

      // Below target — feed the gaps back into the next generation pass.
      feedback = { score, gaps }
    }

    res.status(200).json({
      cv: bestCV,
      atsScore: bestScore < 0 ? null : bestScore,
      verdict: bestVerdict,
      targetScore: TARGET_SCORE,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
