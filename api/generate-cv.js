import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'

// ATS optimization level (set in Settings → My CV). Each level maps to the
// target ATS keyword-COVERAGE score the generated CV must reach and how
// aggressively the prompt mirrors the posting's exact keywords. The handler
// generates, self-scores keyword coverage (what an ATS filter actually keys on —
// NOT a recruiter's holistic fit judgment, which is bounded by immovable factors
// like years of experience / industry and would stall a rewrite below target),
// then refines with the SPECIFIC missing keywords until the CV clears the target
// (or runs out of attempts). Aligning the metric with the setting's own promise
// ("couverture mots-clés max") is what makes the target reliably reachable.
const ATS_LEVELS = {
  light:    { target: 70 },
  balanced: { target: 80 },
  max:      { target: 90 },
}
const DEFAULT_ATS_LEVEL = 'max'
const MAX_ATTEMPTS = 2 // 1 initial generation + up to 1 refinement pass (fewer passes → far fewer output tokens)

// Per-level guidance injected into the generation prompt. Higher levels push
// harder on reusing the posting's exact wording; all levels forbid fabrication.
const ATS_GUIDANCE = {
  light: `ATS OPTIMIZATION LEVEL — LIGHT: Integrate only the few most important must-have keywords from the job description, and only where the candidate genuinely has that experience. Prioritise natural, authentic phrasing over keyword density. Do NOT stuff keywords.`,
  balanced: `ATS OPTIMIZATION LEVEL — BALANCED: Mirror the job description's key must-have keywords/skills wherever the candidate truthfully has that experience, while keeping the writing natural and readable. Front-load the most relevant ones in the Profile and Skills.`,
  max: `ATS OPTIMIZATION LEVEL — MAXIMUM: Aggressively mirror the job description's exact must-have keywords, skills and title wording everywhere the candidate genuinely qualifies. Front-load them in the Profile, the Skills section and the first bullet of the most relevant roles to maximise the ATS keyword match. NEVER fabricate experience the candidate doesn't have.`,
}

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

function buildGeneratePrompt({ cvText, jobDescription, company, position, languageInstruction, feedback, targetScore, atsGuidance, contact, customRules, rules }) {
  // Authoritative contact details from the candidate's profile. When present,
  // these OVERRIDE whatever contact info is in the original CV text (the model
  // tends to corrupt verbatim tokens like emails/LinkedIn URLs when rewriting).
  const contactLines = contact ? [
    contact.name ? `Name: ${contact.name}` : '',
    contact.email ? `Email: ${contact.email}` : '',
    contact.phone ? `Phone: ${contact.phone}` : '',
    contact.linkedin ? `LinkedIn: ${contact.linkedin}` : '',
    contact.website ? `Website/Portfolio: ${contact.website}` : '',
  ].filter(Boolean).join('\n') : ''
  const contactBlock = contactLines ? `
═══════════════════════════════════════════════════════════════════════════════
AUTHORITATIVE CONTACT DETAILS (from the candidate's profile — use VERBATIM):
═══════════════════════════════════════════════════════════════════════════════
${contactLines}
Use these EXACT values in the contact line, character for character. Do NOT use
any email, phone, LinkedIn or website found in the ORIGINAL CV text — they may be
outdated or mis-scanned. Keep the candidate's CITY/location from the original CV.
Never invent, translate or alter these values.
` : ''

  // Toggleable rules the candidate selected (Settings → My CV checklist). Each
  // line reflects ON (enforce) or OFF (relax) and is stated as an explicit
  // OVERRIDE so it wins over the more verbose default guidance further below
  // (e.g. the "include EVERY role / never delete" language). No-fabrication is
  // always present regardless of any toggle. Defaults to all-on when absent.
  const R = rules || {}
  const rulesBlock = `
═══════════════════════════════════════════════════════════════════════════════
✅ GENERATION RULES SELECTED BY THE CANDIDATE (these OVERRIDE any conflicting instruction below):
═══════════════════════════════════════════════════════════════════════════════
- ${R.keepAllRoles === false
    ? 'CONCISENESS FIRST — you MAY omit the oldest / least-relevant roles and keep the CV to ~1-2 focused pages. This OVERRIDES every "include EVERY role / never delete a role" instruction below; do NOT force all roles in.'
    : 'Include EVERY role from the original CV — do not drop or omit any experience.'}
- ${R.singleLanguage === false
    ? 'Mixed language is allowed — you may keep widely-recognised tool names, job titles and terms in their original language where it reads naturally.'
    : 'Write the ENTIRE CV in ONE single, consistent language (headers, bullets, skills, month names).'}
- ${R.atsFormat === false
    ? 'Strict ATS-plain styling is NOT required — you may use slightly richer wording and section naming. (Still no tables, multi-column layouts or images — the single-column markdown structure is mandatory.)'
    : 'Keep strictly ATS-plain formatting — standard section names, ASCII "-" bullets, no icons/emojis, no tables or columns.'}
- ${R.keywordMirroring === false
    ? 'Do NOT force the posting\'s exact keywords — write naturally in the candidate\'s own words (keyword coverage is secondary; the target score below is best-effort only).'
    : 'Mirror the job posting\'s exact must-have keywords/skills (same wording) wherever the candidate truthfully has that experience.'}
- ${R.noFabrication === false
    ? 'CREATIVE LATITUDE ENABLED — you MAY go beyond the literal source CV: infer and add plausible, relevant skills, tools, responsibilities, metrics and elaborations to make the CV as strong and complete as possible for this role. This OVERRIDES every "do not invent / use only the original CV / never fabricate" instruction anywhere below. (Keep it credible — avoid claims that would be trivially disproven in an interview or reference check, e.g. employers, diplomas or titles that never existed.)'
    : 'Never invent experience, skills, employers, dates or metrics — use ONLY what appears in the original CV.'}
`

  // The candidate's own generation rules (Settings → My CV). They steer style and
  // content preferences, but are subordinate to the hard safety constraints
  // (no fabrication, factual fidelity, ATS-parse structure, verbatim contact).
  const customRulesBlock = customRules ? `
═══════════════════════════════════════════════════════════════════════════════
⭐ THE CANDIDATE'S OWN CV RULES (set in their settings — HONOR THESE):
═══════════════════════════════════════════════════════════════════════════════
${customRules}

Apply every rule above. Where one conflicts with the general style guidance
below, the candidate's rule WINS — EXCEPT it can never override these hard
constraints: never fabricate experience, keep the CV factually faithful to the
original, preserve the ATS-parse structure (standard headings, "-" bullets,
single column, no tables/icons), and keep the contact details verbatim. If a
rule would break one of those, apply it only as far as the constraint allows.
` : ''

  const feedbackBlock = feedback ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REVISION REQUIRED — the previous draft scored ${feedback.score}/100 on ATS keyword coverage (target ≥ ${targetScore}).
═══════════════════════════════════════════════════════════════════════════════
An ATS keyword screener found these must-have terms from the job description MISSING or under-represented in the CV:
${(feedback.gaps || []).map(g => `- ${g}`).join('\n')}

Work EVERY missing term above into the CV WITHOUT inventing experience the candidate doesn't have:
- Surface real, relevant experience already in the original CV that legitimately involves each term (it may be buried in an older role).
- Use the EXACT wording from the job description (same terms, same casing) wherever the candidate truthfully has that experience.
- Front-load these terms in the Profile, the Skills section, and the first bullet of the most relevant roles.
- If a term is a genuine hard requirement the candidate lacks, use the closest truthful equivalent from their real experience instead — never fabricate.
` : ''

  return `You are an expert CV writer and ATS specialist. Adapt this CV for the "${position}" role at "${company}".

${languageInstruction}

${atsGuidance}
${rulesBlock}${contactBlock}${customRulesBlock}
═══════════════════════════════════════════════════════════════════════════════
PRIMARY OBJECTIVE — ATS KEYWORD-COVERAGE SCORE ≥ ${targetScore} / 100:
═══════════════════════════════════════════════════════════════════════════════
The adapted CV will be graded by an automated ATS keyword screener that measures
how thoroughly the CV COVERS the posting's must-have keywords, skills and
requirements using the posting's EXACT terminology — NOT holistic fit, seniority
or industry background. To clear ${targetScore}:
  1. Cover the JD's must-have skills/keywords using the posting's EXACT wording
  2. Mirror the role title and key responsibility terms verbatim where truthful
  3. Front-load those terms in the Profile, Skills and first bullets
  4. Surface real but buried experience that matches the JD's requirements
Only mirror a keyword where the candidate genuinely has that experience. NEVER
fabricate — pull from real history.
${feedbackBlock}
═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE:
═══════════════════════════════════════════════════════════════════════════════
✓ INCLUDE EVERY ROLE from the original CV — do NOT drop or omit any experience
✓ ADAPT the language and bullets to highlight relevance to this job
✓ DO NOT INVENT — use only actual achievements from the original CV
✓ EMPHASIZE the most relevant experience (more bullets), but still list every role
✓ CONDENSE older/less relevant roles to fewer bullets — never delete them
✓ CONTACT DETAILS: If "AUTHORITATIVE CONTACT DETAILS" are provided above, use
  those EXACT values for email, phone, LinkedIn and website/portfolio (copy the
  city/location from the original CV). Otherwise copy the city/address, email,
  phone and LinkedIn EXACTLY as written in the original CV. Do NOT relocate the
  candidate to the job's city, do NOT translate or "localize" the address, do
  NOT invent or guess any contact value. If a field is absent, leave it out
  entirely — never fabricate one.

═══════════════════════════════════════════════════════════════════════════════
STRICT FORMAT RULES — ATS-Compatible:
═══════════════════════════════════════════════════════════════════════════════
1. # Full Name
2. Contact line: City · Email · Phone · LinkedIn (plain text, NO symbols) — values copied VERBATIM from the original CV; never change the city/address
3. ## Section Title — use standard section names TRANSLATED INTO THE CV'S LANGUAGE (e.g. EN: Professional Experience / Technical Skills / Education — FR: Expérience professionnelle / Compétences / Formation). Never leave a header in a different language than the rest of the CV. The professional summary is itself a "## " section (## Profile / ## Profil) — it is NEVER a bare paragraph under the name.
4. ### Job Title (e.g., Senior Product Manager)
5. Company Name | Start Date – End Date | Location (pipe-separated, single line)
6. - Bullet point (action verb + quantified result when available)
7. Blank line after each role (before next ###)
8. **Skills**: Listed by category or comma-separated
9. NO icons, boxes, colors (except **bold** for emphasis), images, or special Unicode characters

═══════════════════════════════════════════════════════════════════════════════
TONE & LANGUAGE (Professional, polished, recruiter-ready — never casual):
═══════════════════════════════════════════════════════════════════════════════
This is a formal professional CV. The writing must read as something a senior
candidate would confidently submit to a hiring manager.
- TONE: Professional, concise, confident. Third-person-implied résumé style
  (no "I"/"we", no chatty asides, no self-deprecation, no parenthetical jokes).
- BULLET OPENING — depends on the CV's language, and MUST be grammatically correct:
  • English: start with a strong past-tense action verb (Led, Built, Launched,
    Scaled, Owned, Delivered, Drove, Established…). Vary the verbs.
  • French: use the NOMINAL style — start with an action NOUN that takes "de/du/de la/des"
    (Pilotage du…, Conception de…, Déploiement de…, Lancement de…, Direction de…,
    Mise en place de…, Animation de…, Refonte de…). NEVER write a past participle
    followed by "du/de la/des" (e.g. "Piloté du cycle" is WRONG → "Pilotage du cycle"
    or "Piloté le cycle"). Vary the nouns.
  • Other languages: use the natural résumé convention for that language, grammatically correct.
- Each bullet = ONE crisp line: Action + scope/context + outcome. Quantify when
  the original CV supports it; otherwise state a concrete qualitative outcome.
- AVOID: Repetitive "Led X, drove Y, resulting in Z%" on every line — vary it.
- AVOID: Corporate filler (synergy, leverage as a buzzword, dynamic, passionate).
- AVOID: Casual phrasing, em-dash storytelling ("took time to teach the team…"),
  hedging, or first-person narration. Keep it tight and businesslike.
- Mix quantitative and qualitative results — not every bullet needs a percentage.

Example bullets (PROFESSIONAL):
WEAK (casual): "Built A/B testing framework from scratch—took time to teach the team stats, but we caught 3 major UX issues"
STRONG (professional): "Established an A/B testing framework adopted across the product team, surfacing three high-impact UX fixes that lifted conversion."
STRONG (professional): "Owned the 18-month product roadmap, prioritizing releases that reached 80% user adoption."

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
6. Example adaptations (PROFESSIONAL, specific — not templated):
   ORIGINAL: "Led product roadmap using OKR framework"
   ADAPTED: "Ran quarterly OKR planning across engineering and design, delivering roughly eight prioritized features per cycle."
   or: "Owned the product roadmap end-to-end, focusing the backlog on the highest-impact releases."
   NOT: "Led OKR-driven roadmap, delivering features with 92% on-time delivery" (templated/fabricated metric)

Profile/Summary:
- MUST be its OWN section under a "## " heading named in the CV's language
  (## Profile / ## Profil / ## 概要) placed right after the contact line, BEFORE
  the experience section. NEVER write the summary as a heading-less paragraph
  directly under the name/contact line — it must have a "## " heading.
- 2-3 sentences (60-90 words max) — absolutely NO longer
- Lead with seniority + operating model/scope (e.g. "Senior Product Manager, OKR-driven…"), then domain and signature outcomes
- PROFESSIONAL register: confident, concise, specific. No first person, no casual phrasing.
- Use 4-6 top keywords from job description, naturally woven in
- Stay truthful to original CV context
- Example (PROFESSIONAL): "Senior Product Manager with 10 years in B2B SaaS, leading OKR-driven, data-informed roadmaps. Known for validating opportunities before build to focus engineering on the highest-impact work, consistently shipping features with strong user adoption."
- Example (TOO GENERIC): "Strategic Product Manager with expertise in user-centric discovery, data-driven roadmap prioritization, and cross-functional team alignment across B2B SaaS verticals."

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
- Example (PROFESSIONAL): "Product Strategy: OKR planning, roadmap prioritization, competitive analysis"
- Example (TOO INFLATED): "Strategic Product Management: OKR framework implementation, data-driven roadmap optimization, competitive landscape analysis"
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
9. CRITICAL: Reproduce the candidate's name and contact line (city/address, email, phone, LinkedIn) EXACTLY as in the original CV — never relocate, translate, or invent any of them

Priority order (in order):
1. Score ≥ ${targetScore} on JD relevance — truthfully mirror must-have keywords (CRITICAL)
2. Cover the FULL career history — every role present (CRITICAL)
3. Include measurable outcomes where available
4. Maintain ATS compatibility (important)`
}

// This self-score GATES the refinement loop and is what the CV generator surfaces
// as the "ATS" badge, so it must measure the same thing the "ATS optimization
// level" setting promises: how thoroughly the CV covers the posting's must-have
// keywords/requirements (what an ATS filter keys on). It deliberately does NOT
// grade holistic recruiter fit (seniority, years, industry) — that is bounded by
// factors a rewrite can't change, so it would stall the loop below target no
// matter how well the CV is optimized. Coverage, by contrast, is genuinely
// movable, and the returned gaps are the exact missing keywords the next pass
// injects. (The in-app "Job Match Score" in scoreJob.js still measures fit — a
// deliberately different number.)
function buildScorePrompt({ cv, jobDescription, company, position }) {
  return `You are an Applicant Tracking System (ATS) keyword screener. Score how well the candidate's CV COVERS the must-have keywords, skills and requirements of the job posting — exactly as an automated ATS filter would, by matching the posting's terminology against the CV text.

CANDIDATE CV:
${cv}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription}

METHOD (follow exactly):
1. Extract the must-have keywords/skills/requirements from the job description: hard skills, tools, methodologies, domain terms, the role title and its key responsibilities. Aim for the 12-20 most important.
2. For each, check whether the CV contains it — as the exact term, a very close variant, or an unmistakable synonym.
3. score = round(100 × matched / total). This is a COVERAGE percentage: it reflects ONLY keyword/requirement presence. Do NOT deduct points for the candidate's seniority, years of experience, industry background, or overall desirability.
4. "gaps" = the specific must-have keywords/terms from the posting that are MISSING or under-represented in the CV — the exact wording that should be added. Highest-impact missing terms first. Return [] if coverage is essentially complete.

Respond with ONLY a JSON object (no markdown, no preamble) with this exact structure:
{
  "score": <number 0-100 — keyword-coverage percentage>,
  "verdict": "<STRONG_MATCH|GOOD_MATCH|PARTIAL_MATCH|WEAK_MATCH>",
  "gaps": ["<missing JD keyword/term to surface, exact wording>", "<gap>"]
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

// Deterministically pin the CV's contact line to the profile's authoritative
// values. The model is told to copy them verbatim, but it still corrupts
// email/LinkedIn tokens when rewriting. We rewrite ONLY the actual contact line
// (the first non-empty line after the name that contains a contact token):
// keep its location/city token(s), drop any email/phone/LinkedIn/website it
// produced, and append the profile's exact values. Everything else — including a
// heading-less summary paragraph — is left untouched. No-op without a contact.
function enforceContactLine(md, contact) {
  if (!contact || !md) return md
  const authParts = [contact.email, contact.phone, contact.linkedin, contact.website].filter(Boolean)
  if (!authParts.length) return md

  const lines = md.split('\n')
  const nameIdx = lines.findIndex(l => l.trimStart().startsWith('# '))
  if (nameIdx === -1) return md

  const isEmail    = t => /\S+@\S+\.\S+/.test(t)
  const isLinkedIn = t => /linkedin\.com|linkedin\s*:/i.test(t)
  const isPhone    = t => /\+?\d[\d\s().-]{6,}\d/.test(t)
  const isUrl      = t => /(https?:\/\/|www\.)|\.(com|io|dev|fr|net|me|co|org|app)\b/i.test(t)
  const isContactTok = t => isEmail(t) || isLinkedIn(t) || isPhone(t) || isUrl(t)

  // The contact line is the FIRST non-empty line after the name, and only when it
  // really is a contact line (has a contact token). Stop at any heading so we
  // never reach into the body or treat a summary paragraph as contact info.
  let contactIdx = -1
  for (let i = nameIdx + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    if (raw.trimStart().startsWith('#')) break
    const toks = raw.trim().split(/\s*[·|•]\s*/).map(s => s.trim()).filter(Boolean)
    if (toks.some(isContactTok)) contactIdx = i
    break // only the first non-empty line can be the contact line
  }

  // No contact line present — insert one right after the name; body untouched.
  if (contactIdx === -1) {
    lines.splice(nameIdx + 1, 0, authParts.join(' · '))
    return lines.join('\n')
  }

  const toks = lines[contactIdx].trim().split(/\s*[·|•]\s*/).map(s => s.trim()).filter(Boolean)
  const kept = toks.filter(t => !isContactTok(t)) // keep city/location
  lines[contactIdx] = [...kept, ...authParts].join(' · ')
  return lines.join('\n')
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

  const { cvText, jobDescription, company, position, language, atsLevel, contact, customRules, rules } = req.body
  if (!cvText || !jobDescription) {
    res.status(400).json({ error: 'cvText and jobDescription required' }); return
  }

  // Candidate's own generation rules (optional free text) — trim + hard-cap so a
  // pasted blob can't blow up the prompt. Empty string ⇒ block is omitted.
  const userRules = typeof customRules === 'string' ? customRules.trim().slice(0, 2000) : ''

  // Toggleable rules checklist. Anything not explicitly false ⇒ ON, so an absent
  // or partial object preserves the previous (all-on) behavior. noFabrication
  // defaults ON (protective) but the user can turn it off to allow the CV to go
  // beyond the source material.
  const r = (rules && typeof rules === 'object') ? rules : {}
  const activeRules = {
    keepAllRoles:     r.keepAllRoles     !== false,
    singleLanguage:   r.singleLanguage   !== false,
    atsFormat:        r.atsFormat        !== false,
    keywordMirroring: r.keywordMirroring !== false,
    noFabrication:    r.noFabrication    !== false,
  }

  // Resolve the ATS optimization level → target score + keyword aggressiveness.
  let level = ATS_LEVELS[atsLevel] ? atsLevel : DEFAULT_ATS_LEVEL
  // Free-trial (shared) key: don't burn extra refinement rounds chasing the
  // 'max' 90 target on our dime — cap at 'balanced' so the loop exits sooner.
  if (!userKey && ATS_LEVELS[level].target > ATS_LEVELS.balanced.target) level = 'balanced'
  const targetScore = ATS_LEVELS[level].target
  const atsGuidance = ATS_GUIDANCE[level]

  // Hard rule against producing a half-French / half-English CV. EVERYTHING the
  // model writes must be in ONE language: section headers, profile, every
  // bullet, skill category labels, and the month names inside dates. The only
  // things that keep their original form are proper nouns (company names,
  // product names, school names, certifications like JLPT/PMP) and the
  // candidate's contact line.
  const NO_MIX = '\n\nABSOLUTE LANGUAGE CONSISTENCY (no mixing): The WHOLE CV must be written in this ONE language — section titles/headers, the profile, EVERY bullet point, skill category names, and month names in dates all in that language. Do NOT mix two languages. Do NOT leave any header or sentence in another language. The ONLY exceptions are proper nouns kept verbatim (company names, product names, school names, certification names like JLPT/PMP) and the candidate\'s contact line.'
  const LANGUAGE_INSTRUCTIONS = {
    auto: 'DETECT the language of the job description and write the ENTIRE CV in THAT language.\nFrench JD → French CV. English JD → English CV. Japanese JD → Japanese CV.' + NO_MIX,
    fr: 'Write the ENTIRE CV in FRENCH — all section headers, bullets, skill labels and dates in French. Use the NOMINAL bullet style standard in French CVs (Pilotage du…, Conception de…, Déploiement de…) — never a past participle followed by "du/de la/des" (write "Pilotage du cycle", never "Piloté du cycle"). The French must be grammatically flawless.' + NO_MIX,
    en: 'Write the ENTIRE CV in ENGLISH — all section headers, bullets, skill labels and dates in English.' + NO_MIX,
    jp: 'Write the ENTIRE CV in JAPANESE (日本語). Use natural business Japanese (敬語/丁寧語) appropriate for a professional 職務経歴書.' + NO_MIX,
  }
  const languageInstruction = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.auto

  try {
    let bestCV = ''
    let bestScore = -1
    let bestVerdict = null
    let feedback = null

    // Generate → self-score → refine until the CV clears targetScore, keeping
    // the highest-scoring draft seen across attempts.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const cv = await callClaude(apiKey, {
        maxTokens: 8000,
        prompt: buildGeneratePrompt({ cvText, jobDescription, company, position, languageInstruction, feedback, targetScore, atsGuidance, contact, customRules: userRules, rules: activeRules }),
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

      if (score >= targetScore) break

      // Below target — feed the gaps back into the next generation pass.
      feedback = { score, gaps }
    }

    res.status(200).json({
      cv: enforceContactLine(bestCV, contact),
      atsScore: bestScore < 0 ? null : bestScore,
      verdict: bestVerdict,
      targetScore,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
