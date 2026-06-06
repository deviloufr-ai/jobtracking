export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  const { cvText, jobDescription, company, position } = req.body
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

DETECT the language of the job description below and write the entire adapted CV in THAT SAME language.
If the job description is in English → write the CV in English.
If the job description is in French → write the CV in French.

STRICT RULES:
1. KEEP EXACTLY the same structure, sections and headings as the original CV
2. REWRITE experience descriptions to highlight skills required in the job offer
3. INTEGRATE important keywords from the offer into relevant experiences
4. DO NOT invent new experiences or skills
5. REPHRASE with strong action verbs and quantified results where possible
6. Adapt the summary/profile paragraph first to match the role
7. Return the complete reformatted CV in Markdown with the same sections

ORIGINAL CV:
${cvText.slice(0, 4000)}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription.slice(0, 2000)}

Return ONLY the reformatted CV in Markdown, no comments before or after.`
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
