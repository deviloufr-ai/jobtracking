// Consolidated OAuth handler for Google token management
// Handles both authorization code exchange and token refresh

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, refreshToken } = req.body

  // Determine which operation to perform
  if (code) {
    return handleCodeExchange(req, res)
  } else if (refreshToken) {
    return handleTokenRefresh(req, res)
  } else {
    return res.status(400).json({ error: 'Either code or refreshToken required' })
  }
}

async function handleCodeExchange(req, res) {
  const { code } = req.body

  const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials in environment')
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  try {
    // Exchange code for tokens
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: typeof window !== 'undefined'
          ? window.location.origin
          : `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}`,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Token exchange failed:', data)
      return res.status(response.status).json({ error: data.error_description || 'Token exchange failed' })
    }

    return res.status(200).json({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type,
    })
  } catch (error) {
    console.error('Token exchange error:', error)
    return res.status(500).json({ error: error.message || 'Token exchange failed' })
  }
}

async function handleTokenRefresh(req, res) {
  const { refreshToken } = req.body

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
