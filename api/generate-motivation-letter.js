import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'

// Generation model. Default Haiku 4.5 — cheap, keeps the free-trial path
// affordable. Set LETTER_MODEL on the server (Vercel env) to a stronger model
// (e.g. a Sonnet id) for materially better, less generic letters, at higher
// per-call cost on every request billed to this key. Nothing changes until set.
const LETTER_MODEL = process.env.LETTER_MODEL || 'claude-haiku-4-5-20251001'

// How much of the CV / job description to feed the model. The old 2000-char cap
// dropped the most relevant late-career achievements (CV) and the actual
// requirements buried mid-posting (JD), producing generic letters. Keep a
// generous bound so a tampered client can't blow up the prompt.
const CV_CHARS = 8000
const JD_CHARS = 6000

async function callClaude(apiKey, { maxTokens, prompt }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: LETTER_MODEL,
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

// Detect when the model returned a refusal / meta-commentary instead of an actual
// letter — it does this when the "job description" it was handed is unusable
// (a scraped JS-shell, an error page, an empty blob). A real cover letter opens
// with a city/date and a salutation; it never opens by commenting on the task or
// the readability of the input. We only inspect the opening so a legitimate
// letter that happens to quote a phrase later can't trip this. Signals cover both
// English and French (the two generation languages).
function looksLikeRefusal(text) {
  const t = (text || '').trim()
  if (!t) return true
  const head = t.slice(0, 500).toLowerCase()
  const signals = [
    // English
    'unable to complete',
    "i'm unable to",
    'i am unable to',
    "i can't complete",
    'cannot complete this',
    'not accessible to me',
    'javascript error',
    'please paste',
    'paste the full text',
    'provide the job description',
    'provide the actual job',
    'as an ai',
    "i can't write",
    'i cannot write',
    // French
    'je ne peux pas',
    'je ne suis pas en mesure',
    "je suis dans l'incapacité",
    "je n'ai pas accès",
    "n'est pas accessible",
    "n'est pas exploitable",
    'veuillez fournir',
    'veuillez coller',
    'collez le texte',
    'fournir la description',
    'la description du poste',
    "en tant qu'ia",
    "en tant qu'intelligence artificielle",
  ]
  return signals.some(s => head.includes(s))
}

function languageInstruction(language) {
  return language === 'auto'
    ? 'DETECT the language of the job description and write the ENTIRE letter in THAT language.\nFrench JD → French letter. English JD → English letter.'
    : language === 'fr'
    ? 'Write the ENTIRE letter in FRENCH.'
    : 'Write the ENTIRE letter in ENGLISH.'
}

function buildLetterPrompt({ cvText, jobDescription, company, position, language, context }) {
  const hasContext = !!(context && context.trim())
  return `You are an expert recruiter and professional letter writer. Write a compelling motivation letter (cover letter) for this job application.
${hasContext ? `
=== TOP PRIORITY: CANDIDATE'S INSTRUCTIONS ===
The candidate provided the following specific instructions. These OVERRIDE the generic guidance below and MUST be reflected clearly in the letter (priorities to emphasize, tone, availability, specific points). Do not ignore or water them down:
"""
${context.trim().slice(0, 1500)}
"""
=== END OF CANDIDATE'S INSTRUCTIONS ===
` : ''}
${languageInstruction(language)}

STRUCTURE (standard professional format)${hasContext ? ' — adapt freely to the candidate\'s instructions above; if they ask for something shorter/different, FOLLOW THEM and drop or compress these parts' : ''}:
1. [City], [Date] — top right
2. Dear Hiring Manager / Dear [Company] Team (professional greeting)
3. Opening paragraph: Express genuine interest + show knowledge of the company
4. 2-3 body paragraphs:
   - Match your experience to their requirements (use job description keywords)
   - Highlight 1-2 key achievements that align with the role
   - Explain why you're excited about THIS specific role/company
5. Closing paragraph: Call to action, thank them, signature

TONE & CONTENT RULES:
- Professional yet warm and personable (avoid generic platitudes)
- Specific: Reference the EXACT role requirements from the job description and match them to REAL achievements from the CV below
- Achievements: Use metrics and results (not just responsibilities)
- Length: ${hasContext ? 'follow the candidate\'s instructions above; only if they say nothing about length, aim for 3-4 short paragraphs (~250-350 words). If they ask for a short/very short letter, write a genuinely brief one (a few sentences) and ignore the 250-350 word target' : '3-4 short paragraphs, about 250-350 words'}
- Keywords: Front-load job description keywords naturally
- GROUNDING (no fabrication): Base every specific claim on the CV, the job description, or the candidate's instructions above. Do NOT invent company facts, products, "recent news", figures, or personal anecdotes. If you don't have a concrete company detail, connect to the role's stated mission/requirements from the posting instead of guessing.
- Avoid: "I am writing to apply", "I believe I would be good at", generic praise
- Focus on VALUE: What can YOU bring to THEM

WRITE LIKE A HUMAN — this must NOT read as AI-generated:
- NEVER use the em-dash (—) or en-dash (–). Use a comma, period, or parentheses instead.
- Vary sentence length: mix short, punchy sentences with longer ones. Avoid a uniform rhythm.
- Ban AI-cliché phrasing: "I am thrilled/excited to", "delve into", "leverage my skills", "passion for", "in today's fast-paced world", "I am confident that", "furthermore/moreover", "tapestry", "testament to", "navigate the landscape", "spearheaded", "robust".
- Avoid the rule-of-three list pattern ("X, Y, and Z") in every sentence. Don't over-structure.
- No bullet points in the letter body. Write flowing prose.
- It's fine to be slightly imperfect and conversational: a direct statement, a concrete anecdote, plain words. Sound like a real person who knows their work, not a template.
- Don't start consecutive paragraphs the same way (e.g. all starting with "I").

ORIGINAL CV (the ONLY source of the candidate's real achievements — draw specifics from here):
${cvText.slice(0, CV_CHARS)}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription.slice(0, JD_CHARS)}
${hasContext ? `
REMINDER: Make sure the candidate's instructions at the top of this prompt are clearly reflected in the letter.
` : ''}
Return ONLY the motivation letter text (no preamble, no metadata). ${hasContext ? "Follow the candidate's instructions above for length and for what to include: if they asked for a short letter (or a character/word limit), keep it that short and OMIT any of the date, salutation, closing or signature that would not fit. Their length request wins over any structural convention in this prompt." : 'Include the date, salutation, paragraphs, closing, and signature line.'} Format as plain text with blank lines between paragraphs.`
}

// Self-critique pass: hand the draft back with a concrete checklist and let the
// model rewrite it. This is the letter's equivalent of the CV's refine loop —
// it catches the generic, cliché, or requirement-missing draft that a single shot
// produces. Costs one extra Claude call but NOT an extra free-trial credit (the
// quota is charged once per request, not per Claude call).
function buildPolishPrompt({ draft, jobDescription, company, position, language, context }) {
  const hasContext = !!(context && context.trim())
  return `You are a senior hiring manager reviewing a DRAFT cover letter before it is sent. Critique it against the checklist, then return an IMPROVED version.

${languageInstruction(language)}

CHECKLIST — fix every item that fails:
1. SPECIFIC, not generic: it names 1-2 concrete achievements from the candidate and ties them to THIS posting's actual requirements. A letter that could be sent to any company FAILS — make it unmistakably about this role.
2. GROUNDED: no invented company facts, products, news, or figures. Remove or generalise anything not supported by the draft's own content.
3. HUMAN voice: no em-dashes/en-dashes; no AI-cliché phrasing ("thrilled to", "leverage", "passion for", "I am confident that", "spearheaded", "robust", "in today's fast-paced world"); varied sentence length; no rule-of-three lists on every line; consecutive paragraphs don't all open the same way.
4. VALUE-forward: leads with what the candidate brings to THEM, not what they want.
5. TIGHT: ${hasContext ? "respect the candidate's length instructions" : 'about 250-350 words, 3-4 paragraphs'}; cut filler.
${hasContext ? `
The candidate's own instructions (these still take priority — keep them satisfied):
"""
${context.trim().slice(0, 1500)}
"""
` : ''}
JOB DESCRIPTION (${company} - ${position}) — the letter must clearly target this:
${jobDescription.slice(0, JD_CHARS)}

DRAFT TO IMPROVE:
"""
${draft}
"""

Return ONLY the improved letter text (no preamble, no critique notes, no metadata). If the draft already passes every item, return it essentially unchanged. Keep the same language as the draft. Format as plain text with blank lines between paragraphs.`
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `motivation-letter:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

  const userKey = req.body?.apiKey?.trim()
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }
  if (!userKey) {
    const quota = await enforceSharedKeyQuota(req)
    if (!quota.ok) { res.status(402).json({ error: 'Free trial used up. Add your own Claude API key in Settings to keep using the AI features.', code: 'TRIAL_EXHAUSTED' }); return }
  }

  const { cvText, jobDescription, company, position, language, context } = req.body
  if (!cvText || !jobDescription) {
    res.status(400).json({ error: 'cvText and jobDescription required' }); return
  }

  try {
    // 1) First draft.
    const draft = await callClaude(apiKey, {
      maxTokens: 3000,
      prompt: buildLetterPrompt({ cvText, jobDescription, company, position, language, context }),
    })

    // Guard against storing a refusal as the letter (see looksLikeRefusal). This
    // happens when the job description is unusable — surface an actionable error
    // instead of a meta-message the user would have to notice and delete.
    if (looksLikeRefusal(draft)) {
      res.status(422).json({
        error: "La description du poste fournie n'est pas exploitable. Ajoutez ou collez une vraie description du poste (via ✏️ Modifier la fiche), puis relancez la génération.",
        code: 'JD_UNREADABLE',
      })
      return
    }

    // 2) Self-critique polish pass — the letter's equivalent of the CV refine
    // loop. Best-effort: if it fails, errors, or comes back as a refusal/empty,
    // keep the (already valid) first draft rather than failing the request.
    let letter = draft
    try {
      const polished = await callClaude(apiKey, {
        maxTokens: 3000,
        prompt: buildPolishPrompt({ draft, jobDescription, company, position, language, context }),
      })
      if (polished && polished.trim() && !looksLikeRefusal(polished)) letter = polished
    } catch { /* keep the first draft */ }

    res.status(200).json({ letter })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
