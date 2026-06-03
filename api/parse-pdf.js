export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const { base64, filename } = req.body
    if (!base64) { res.status(400).json({ error: 'No PDF data' }); return }

    // Use Claude to extract text from PDF (supports PDF natively)
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

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
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64
              }
            },
            {
              type: 'text',
              text: `Extrait TOUT le texte de ce CV en préservant exactement la structure : sections, titres, listes, dates, noms d'entreprises. Retourne uniquement le texte brut structuré, sans commentaires.`
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err?.error?.message || `Claude API ${response.status}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    res.status(200).json({
      text,
      pages: 1,
      filename: filename || 'cv.pdf'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
