// Shared CORS configuration for all API endpoints
export function setupCORS(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin || ''
  const allowedOrigins = [
    'https://jobtracking-three.vercel.app',
    'http://localhost:5173',  // Vite dev
    'http://localhost:3000',  // Alternative dev
  ]

  // Only set CORS header if origin is allowed (security)
  if (!allowedOrigins.includes(origin)) {
    // Origin not allowed — don't set CORS header, browser will block
    if (req.method === 'OPTIONS') {
      res.status(403).json({ error: 'Origin not allowed' })
      return true
    }
    // For non-OPTIONS, still return data but browser won't see it (CORS blocks it)
    return false
  }

  // Origin is allowed — set CORS headers
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return true  // Indicates preflight was handled
  }

  return false
}
