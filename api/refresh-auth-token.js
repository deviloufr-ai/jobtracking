// Refresh Google access token using refresh token
// This is called when access token is about to expire

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { refreshToken } = req.body
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' })
  }

  const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials in environment')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Token refresh failed:', data)
      return res.status(response.status).json({ error: data.error_description || 'Token refresh failed' })
    }

    return res.status(200).json({
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type,
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return res.status(500).json({ error: error.message || 'Token refresh failed' })
  }
}
