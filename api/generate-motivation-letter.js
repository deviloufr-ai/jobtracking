export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

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
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are an expert recruiter and professional letter writer. Write a compelling motivation letter (cover letter) for this job application.

${language === 'auto'
  ? 'DETECT the language of the job description and write the ENTIRE letter in THAT language.\nFrench JD → French letter. English JD → English letter.'
  : language === 'fr'
  ? 'Write the ENTIRE letter in FRENCH.'
  : 'Write the ENTIRE letter in ENGLISH.'}

STRUCTURE (standard professional format):
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
- Length: 3-4 short paragraphs, about 250-350 words
- Keywords: Front-load job description keywords naturally
- Show you've researched: mention company values, products, or recent news if possible
- Avoid: "I am writing to apply", "I believe I would be good at", generic praise
- Focus on VALUE: What can YOU bring to THEM

ORIGINAL CV (for context):
${cvText.slice(0, 2000)}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription.slice(0, 2000)}

Return ONLY the motivation letter text (no preamble, no metadata). Include the date, salutation, paragraphs, closing, and signature line. Format as plain text with blank lines between paragraphs.`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const generatedLetter = data.content?.[0]?.text || ''
    res.status(200).json({ letter: generatedLetter })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
