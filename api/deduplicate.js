import { applyCors } from './_lib/http.js'

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }) }
  try {
    console.log('📨 Deduplicate request received')

    // Resolve Supabase target from SERVER env only. NEVER trust a URL from the
    // request body — doing so would let a caller redirect the service-role key
    // (full DB admin) to an arbitrary host (credential exfiltration).
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl) {
      console.error('❌ Missing SUPABASE_URL')
      return res.status(500).json({ error: 'Supabase URL not configured' })
    }
    if (!serviceKey) {
      console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY')
      return res.status(500).json({ error: 'Service key not configured' })
    }
    if (!anonKey) {
      console.error('❌ Missing SUPABASE_ANON_KEY')
      return res.status(500).json({ error: 'Anon key not configured' })
    }

    // ── Authentication ──────────────────────────────────────────────────────
    // This endpoint runs with the service-role key (bypasses RLS), so it MUST
    // derive the target user from a VERIFIED access token — never from the
    // request body. Trusting a client-supplied userId would let anyone delete
    // another user's rows by guessing their UUID (IDOR / broken access control).
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) {
      return res.status(401).json({ error: 'Missing access token' })
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    const authUser = await userRes.json()
    const userId = authUser?.id
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return res.status(401).json({ error: 'Could not resolve authenticated user' })
    }

    console.log(`🔄 Deduplicating for user: ${userId}`)

    console.log('✓ Service key available')

    // Fetch all jobs for this user via REST API
    const jobsUrl = `${supabaseUrl}/rest/v1/jobs?user_id=eq.${userId}`
    console.log(`📥 Fetching jobs from: ${jobsUrl}`)

    const jobsResponse = await fetch(jobsUrl, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
    // primaryId → [loserIds]: the loser rows' history is moved to the primary BEFORE
    // deletion, because job_history.job_id is ON DELETE CASCADE — deleting a loser
    // would otherwise permanently drop its timeline (the client dedups history on load).
    const reparentByPrimary = new Map()

    for (const [, group] of groups) {
      if (group.length > 1) {
        group.sort((a, b) =>
          new Date(b.updated_at || b.date).getTime() - new Date(a.updated_at || a.date).getTime()
        )
        const [primary, ...others] = group
        const loserIds = others.map(j => j.id)
        toDelete.push(...loserIds)
        reparentByPrimary.set(primary.id, loserIds)
        duplicates.push({
          company: primary.company,
          position: primary.position,
          duplicateCount: others.length
        })
      }
    }

    let deletedCount = 0
    if (toDelete.length > 0) {
      // 1) Move each loser's history onto its primary (before the cascade delete),
      //    so the merged candidature keeps the full timeline.
      for (const [primaryId, loserIds] of reparentByPrimary) {
        const reparentUrl = `${supabaseUrl}/rest/v1/job_history?job_id=in.(${loserIds.join(',')})`
        const reparentRes = await fetch(reparentUrl, {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ job_id: primaryId, last_modified_at: new Date().toISOString() })
        })
        if (!reparentRes.ok) {
          console.warn(`⚠️ History reparent → ${primaryId}: ${reparentRes.status} ${await reparentRes.text()}`)
        }
      }

      // 2) Delete the loser job rows.
      const deleteUrl = `${supabaseUrl}/rest/v1/jobs?id=in.(${toDelete.join(',')})`
      console.log(`🗑️ Deleting ${toDelete.length} duplicates`)

      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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

      // 3) Tombstone the removed ids so every client converges — removes its local
      //    copy and never re-uploads it. Without this the incremental poll (which
      //    only returns changed rows, never deletions) leaves losers on other devices
      //    and they get re-pushed, so the duplicates come back with lost history.
      //    ignore-duplicates skips the UNIQUE(user_id, job_id) on a re-run.
      const tombstones = toDelete.map(id => ({ user_id: userId, job_id: id }))
      const tombRes = await fetch(`${supabaseUrl}/rest/v1/deleted_jobs`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify(tombstones)
      })
      if (!tombRes.ok) {
        console.warn(`⚠️ Tombstone insert: ${tombRes.status} ${await tombRes.text()}`)
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
