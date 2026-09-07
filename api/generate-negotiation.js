import { applyCors, getClientIp, rateLimit, enforceSharedKeyQuota } from './_lib/http.js'

// Salary-negotiation assistant. Given the current offer (structured comp) and the
// candidate's target, drafts a professional negotiation message the user can edit
// and send themselves. Draft-only — like the cover-letter and email generators, we
// never send anything. Mirrors generate-motivation-letter.js for CORS, the rate
// limit and the shared-key trial gate.

// Detect a refusal / meta-commentary instead of an actual negotiation draft (Haiku
// does this when handed unusable input). A real draft opens with a greeting; it
// never opens by commenting on the task. We only inspect the opening.
function looksLikeRefusal(text) {
  const t = (text || '').trim()
  if (!t) return true
  const head = t.slice(0, 400).toLowerCase()
  const signals = [
    'unable to complete', "i'm unable to", 'i am unable to',
    "i can't complete", 'cannot complete this', 'as an ai',
    "i can't write", 'i cannot write', 'please provide', 'provide more',
  ]
  return signals.some(s => head.includes(s))
}

// Format the structured compensation object into a compact human-readable block
// for the prompt. Kept server-side so the endpoint is self-contained.
function describeComp(comp) {
  if (!comp || typeof comp !== 'object') return 'Not specified.'
  const cur = comp.currency || 'EUR'
  const period = comp.basePeriod === 'month' ? '/month' : '/year'
  const lines = []
  if (comp.base) lines.push(`- Base salary: ${comp.base} ${cur}${period}`)
  if (comp.bonus) lines.push(`- Annual bonus (target): ${comp.bonus} ${cur}`)
  if (comp.equity) lines.push(`- Equity (annualized): ${comp.equity} ${cur}`)
  if (comp.benefits) lines.push(`- Benefits: ${String(comp.benefits).slice(0, 300)}`)
  if (comp.remotePct != null && comp.remotePct !== '') lines.push(`- Remote: ${comp.remotePct}%`)
  if (comp.location) lines.push(`- Location: ${String(comp.location).slice(0, 120)}`)
  return lines.length ? lines.join('\n') : 'Not specified.'
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { ok, retryAfter } = rateLimit({ key: `negotiation:${getClientIp(req)}`, limit: 20, windowMs: 60_000 })
  if (!ok) { res.setHeader('Retry-After', String(retryAfter)); res.status(429).json({ error: 'Too many requests. Please slow down.' }); return }

  const userKey = req.body?.apiKey?.trim()
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }
  if (!userKey) {
    const quota = await enforceSharedKeyQuota(req)
    if (!quota.ok) { res.status(402).json({ error: 'Free trial used up. Add your own Claude API key in Settings to keep using the AI features.', code: 'TRIAL_EXHAUSTED' }); return }
  }

  const { company, position, compensation, target, context, language, format } = req.body || {}
  if (!company && !position) {
    res.status(400).json({ error: 'company or position required' }); return
  }

  const hasContext = !!(context && context.trim())
  const wantsScript = format === 'script' // 'script' = talking points for a call; default = email

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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are an expert career coach who helps candidates negotiate job offers professionally and confidently, without being adversarial.

${language === 'auto'
  ? 'DETECT the language from the fields below (company, target, context) and write the ENTIRE response in THAT language. If unsure, default to French.'
  : language === 'en'
  ? 'Write the ENTIRE response in ENGLISH.'
  : 'Write the ENTIRE response in FRENCH.'}

Write a ${wantsScript ? 'set of concise talking points (bullet list) for a live negotiation call' : 'polite, professional negotiation email'} for this candidate.

ROLE: ${position || 'the role'} at ${company || 'the company'}

CURRENT OFFER:
${describeComp(compensation)}

WHAT THE CANDIDATE WANTS:
${(target && target.trim()) ? target.trim().slice(0, 800) : 'A reasonable increase in total compensation, framed around their value and market rate.'}
${hasContext ? `
ADDITIONAL CONTEXT FROM THE CANDIDATE (honour this):
"""
${context.trim().slice(0, 1000)}
"""
` : ''}
GUIDELINES:
- Open by reaffirming genuine enthusiasm for the role and the company.
- Anchor the ask on value delivered and market rate, not personal need.
- Be specific about the number(s) requested, but stay collaborative and flexible.
- Keep a warm, confident, respectful tone. Never threaten or issue ultimatums.
- Acknowledge the whole package (base, bonus, equity, remote, benefits), not only base.
- ${wantsScript ? 'Give 5-8 short bullet points the candidate can glance at during the call.' : 'Keep it to a short, scannable email (about 150-220 words), with a subject line.'}

WRITE LIKE A HUMAN — this must NOT read as AI-generated:
- NEVER use the em-dash (—) or en-dash (–). Use a comma, period, or parentheses.
- Vary sentence length. Avoid AI-cliché phrasing ("I am thrilled to", "leverage", "I am confident that", "furthermore").
- No generic platitudes. Sound like a real, self-assured professional.

Return ONLY the ${wantsScript ? 'talking points' : 'email (subject line included)'} as plain text, no preamble or meta-commentary.`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const draft = data.content?.[0]?.text || ''

    if (looksLikeRefusal(draft)) {
      res.status(422).json({
        error: 'Could not draft a negotiation message from the details provided. Add the offer figures and what you would like to ask for, then try again.',
        code: 'INPUT_UNUSABLE',
      })
      return
    }

    res.status(200).json({ draft })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
