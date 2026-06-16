export async function searchCompanyAddress(companyName) {
  if (!companyName?.trim()) {
    throw new Error('Company name is required')
  }

  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: companyName.trim() })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to find company address')
    }

    return {
      address: data.address,
      name: data.name,
    }
  } catch (error) {
    console.error('Company search error:', error)
    throw error
  }
}
