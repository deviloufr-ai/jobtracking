import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  try {
    console.log('📨 Received request:', { method: req.method, body: req.body })

    // Get user ID from request body
    const { userId } = req.body

    if (!userId) {
      console.error('❌ Missing userId')
      return res.status(400).json({ error: 'Missing userId in request body' })
    }

    console.log(`🔄 Deduplicating jobs for user: ${userId}`)

    // Check Supabase config
    console.log('📡 Supabase URL:', process.env.VITE_SUPABASE_URL ? '✓' : '❌')
    console.log('📡 Service role key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '❌')

    // Fetch all jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)

    if (jobsError) {
      console.error('❌ Supabase fetch error:', jobsError)
      return res.status(400).json({ error: jobsError.message })
    }

    console.log(`✓ Fetched ${jobs?.length || 0} jobs`)

    if (!jobs?.length) {
      return res.json({
        success: true,
        stats: { totalJobs: 0, duplicateGroups: 0, deletedJobs: 0 },
        duplicateGroups: []
      })
    }

    // Simple dedup: group by company+position, keep newest
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
        // Keep newest
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

    // Delete duplicates
    let deletedCount = 0
    if (toDelete.length > 0) {
      const { count } = await supabase
        .from('jobs')
        .delete()
        .in('id', toDelete)
      deletedCount = count || toDelete.length
    }

    console.log(`✓ Deleted ${deletedCount} duplicates`)

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
    console.error('Error:', error)
    return res.status(500).json({ error: error.message })
  }
}
