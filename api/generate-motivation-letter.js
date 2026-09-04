import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'

// Detect when Haiku returned a refusal / meta-commentary instead of an actual
// letter — it does this when the "job description" it was handed is unusable
// (a scraped JS-shell, an error page, an empty blob). A real cover letter opens
// with a city/date and a salutation; it never opens by commenting on the task or
// the readability of the input. We only inspect the opening so a legitimate
// letter that happens to quote a phrase later can't trip this.
function looksLikeRefusal(text) {
  const t = (text || '').trim()
  if (!t) return true
  const head = t.slice(0, 500).toLowerCase()
  const signals = [
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
  ]
  return signals.some(s => head.includes(s))
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

  const hasContext = !!(context && context.trim())

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
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are an expert recruiter and professional letter writer. Write a compelling motivation letter (cover letter) for this job application.
${hasContext ? `
=== TOP PRIORITY: CANDIDATE'S INSTRUCTIONS ===
The candidate provided the following specific instructions. These OVERRIDE the generic guidance below and MUST be reflected clearly in the letter (priorities to emphasize, tone, availability, specific points). Do not ignore or water them down:
"""
${context.trim().slice(0, 1500)}
"""
=== END OF CANDIDATE'S INSTRUCTIONS ===
` : ''}
${language === 'auto'
  ? 'DETECT the language of the job description and write the ENTIRE letter in THAT language.\nFrench JD → French letter. English JD → English letter.'
  : language === 'fr'
  ? 'Write the ENTIRE letter in FRENCH.'
  : 'Write the ENTIRE letter in ENGLISH.'}

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
- Specific: Reference actual company/product details + exact role requirements
- Achievements: Use metrics and results (not just responsibilities)
- Length: ${hasContext ? 'follow the candidate\'s instructions above; only if they say nothing about length, aim for 3-4 short paragraphs (~250-350 words). If they ask for a short/very short letter, write a genuinely brief one (a few sentences) and ignore the 250-350 word target' : '3-4 short paragraphs, about 250-350 words'}
- Keywords: Front-load job description keywords naturally
- Show you've researched: mention company values, products, or recent news if possible
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

ORIGINAL CV (for context):
${cvText.slice(0, 2000)}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription.slice(0, 2000)}
${hasContext ? `
REMINDER: Make sure the candidate's instructions at the top of this prompt are clearly reflected in the letter.
` : ''}
Return ONLY the motivation letter text (no preamble, no metadata). ${hasContext ? "Follow the candidate's instructions above for length and for what to include: if they asked for a short letter (or a character/word limit), keep it that short and OMIT any of the date, salutation, closing or signature that would not fit. Their length request wins over any structural convention in this prompt." : 'Include the date, salutation, paragraphs, closing, and signature line.'} Format as plain text with blank lines between paragraphs.`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const generatedLetter = data.content?.[0]?.text || ''

    // Guard against storing a refusal as the letter (see looksLikeRefusal). This
    // happens when the job description is unusable — surface an actionable error
    // instead of a meta-message the user would have to notice and delete.
    if (looksLikeRefusal(generatedLetter)) {
      res.status(422).json({
        error: "La description du poste fournie n'est pas exploitable. Ajoutez ou collez une vraie description du poste (via ✏️ Modifier la fiche), puis relancez la génération.",
        code: 'JD_UNREADABLE',
      })
      return
    }

    res.status(200).json({ letter: generatedLetter })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
