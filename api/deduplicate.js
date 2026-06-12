export default async function handler(req, res) {
  try {
    console.log('📨 Deduplicate request received')

    const { userId, supabaseUrl } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' })
    }
    if (!supabaseUrl) {
      return res.status(400).json({ error: 'Missing supabaseUrl' })
    }

    console.log(`🔄 Deduplicating for user: ${userId}`)

    // Get service key from environment
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

    if (!serviceKey) {
      console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY')
      return res.status(500).json({ error: 'Service key not configured' })
    }

    console.log('✓ Using Supabase URL:', supabaseUrl.substring(0, 20) + '...')
    console.log('✓ Service key available')

    // Fetch all jobs for this user via REST API
    const jobsUrl = `${supabaseUrl}/rest/v1/jobs?user_id=eq.${userId}`
    console.log(`📥 Fetching jobs from: ${jobsUrl}`)

    const jobsResponse = await fetch(jobsUrl, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!jobsResponse.ok) {
      const errText = await jobsResponse.text()
      console.error(`❌ Failed to fetch jobs: ${jobsResponse.status} ${errText}`)
      return res.status(jobsResponse.status).json({ error: `Supabase fetch failed: ${jobsResponse.status}` })
    }

    const jobs = await jobsResponse.json()
    console.log(`✓ Fetched ${jobs.length} jobs`)

    if (!jobs.length) {
      return res.json({
        success: true,
        stats: { totalJobs: 0, duplicateGroups: 0, deletedJobs: 0 },
        duplicateGroups: []
      })
    }

    // Deduplicate logic
    const normalizeCompany = (name) =>
      (name || '').toLowerCase()
        .replace(/\s+(sas|sasu|sarl|sa|srl|inc|ltd|llc|gmbh|bv|nv|ag|spa|oy|ab)\.?\s*$/i, '')
        .replace(/\.(io|com|fr|co|net|org|eu|de|uk|be|ch|ca|us|tech|dev)\s*$/i, '')
        .replace(/\b(technologies|digital|solutions|group|labs|studio|hq|services|consulting|innovation|ventures|project|projects)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')

    const groups = new Map()
    for (const job of jobs) {
      const key = `${normalizeCompany(job.company)}|||${(job.position || '').toLowerCase().trim()}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(job)
    }

    const toDelete = []
    const duplicates = []

    for (const [key, group] of groups) {
      if (group.length > 1) {
        group.sort((a, b) =>
          new Date(b.updated_at || b.date).getTime() - new Date(a.updated_at || a.date).getTime()
        )
        const [primary, ...others] = group
        toDelete.push(...others.map(j => j.id))
        duplicates.push({
          company: primary.company,
          position: primary.position,
          duplicateCount: others.length
        })
      }
    }

    // Delete duplicates via REST API
    let deletedCount = 0
    if (toDelete.length > 0) {
      const deleteUrl = `${supabaseUrl}/rest/v1/jobs?id=in.(${toDelete.join(',')})`
      console.log(`🗑️ Deleting ${toDelete.length} duplicates`)

      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (deleteResponse.ok) {
        deletedCount = toDelete.length
        console.log(`✓ Deleted ${deletedCount} duplicates`)
      } else {
        const errText = await deleteResponse.text()
        console.warn(`⚠️ Delete response: ${deleteResponse.status} ${errText}`)
        deletedCount = toDelete.length
      }
    }

    return res.json({
      success: true,
      stats: {
        totalJobs: jobs.length,
        duplicateGroups: duplicates.length,
        deletedJobs: deletedCount
      },
      duplicateGroups: duplicates
    })
  } catch (error) {
    console.error('❌ Error:', error.message)
    return res.status(500).json({ error: error.message })
  }
}
