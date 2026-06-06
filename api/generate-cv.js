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

DETECT the language of the job description and write the ENTIRE CV in THAT language.
French JD → French CV. English JD → English CV.

STRICT FORMAT RULES — follow EXACTLY:
1. # Full Name  (h1, one line)
2. Contact line(s) as plain text  (no # prefix)
3. ## Section Title  (h2 for each section: Profil, Expérience Professionnelle, Compétences, Formation…)
4. ### Job Title  (h3 for each position — title only, NO company or dates on this line)
5. Company Name  (plain text line immediately after ### — company name only)
6. Dates | Location  (plain text line — e.g. "Jan 2021 – May 2023 | Remote, Tokyo")
7. - Bullet point  (one achievement per line, starting with -)
8. Leave a blank line between each experience block

CONTENT RULES:
- Rewrite bullet points to highlight skills required in the job offer
- Integrate important keywords from the offer into relevant experiences
- Do NOT invent new experiences or skills
- Use strong action verbs and quantified results where the original has numbers
- Adapt the profile/summary paragraph to match the role

ORIGINAL CV:
${cvText.slice(0, 4000)}

JOB DESCRIPTION (${company} - ${position}):
${jobDescription.slice(0, 2000)}

Return ONLY the Markdown CV, no preamble, no comments.`
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
