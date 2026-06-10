// Shared CORS configuration for all API endpoints
export function setupCORS(req, res) {
  const origin = req.headers.origin || ''
  const allowedOrigins = [
    'https://jobtracking-three.vercel.app',
    'http://localhost:5173',  // Vite dev
    'http://localhost:3000',  // Alternative dev
  ]

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return true  // Indicates preflight was handled
  }

  return false
}
