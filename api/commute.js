export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { homeAddress, companyAddress } = req.body

  if (!homeAddress || !companyAddress) {
    res.status(400).json({ error: 'Both homeAddress and companyAddress are required' })
    return
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    res.status(500).json({ error: 'Google Maps API key not configured' })
    return
  }

  try {
    const params = new URLSearchParams({
      origins: homeAddress,
      destinations: companyAddress,
      mode: 'driving',
      key: process.env.GOOGLE_MAPS_API_KEY,
    })

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK') {
      return res.status(400).json({
        error: `Google Maps API error: ${data.status}`,
        message: data.error_message || 'Failed to calculate commute',
      })
    }

    const result = data.rows[0]?.elements[0]
    if (!result || result.status !== 'OK') {
      return res.status(400).json({
        error: 'Could not find route between addresses',
        message: result?.status || 'Unknown error',
      })
    }

    res.json({
      durationMinutes: Math.round(result.duration.value / 60),
      distanceKm: parseFloat((result.distance.value / 1000).toFixed(1)),
      durationText: result.duration.text,
      distanceText: result.distance.text,
    })
  } catch (error) {
    console.error('Commute API error:', error)
    res.status(500).json({ error: error.message || 'Failed to calculate commute' })
  }
}
