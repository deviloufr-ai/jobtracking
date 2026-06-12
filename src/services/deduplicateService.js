import { supabase } from './supabase'
import { getSyncUserIdForSupabase } from './gmail'

/**
 * Deduplicate jobs client-side (uses existing Supabase client)
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Deduplicating jobs (client-side)...')

    const userId = getSyncUserIdForSupabase()
    if (!userId) {
      throw new Error('No user ID found. Please log in.')
    }

    // Fetch all jobs for this user
    console.log(`📥 Fetching jobs for user: ${userId}`)
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`)
    }

    console.log(`✓ Fetched ${jobs?.length || 0} jobs`)

    if (!jobs?.length) {
      return {
        success: true,
        stats: { totalJobs: 0, duplicateGroups: 0, deletedJobs: 0 },
        duplicateGroups: []
      }
    }

    // Deduplication logic
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

    // Delete duplicates
    let deletedCount = 0
    if (toDelete.length > 0) {
      console.log(`🗑️ Deleting ${toDelete.length} duplicates...`)
      const { count, error: deleteError } = await supabase
        .from('jobs')
        .delete()
        .in('id', toDelete)

      if (deleteError) {
        throw new Error(`Failed to delete: ${deleteError.message}`)
      }

      deletedCount = count || toDelete.length
      console.log(`✓ Deleted ${deletedCount} duplicates`)
    }

    return {
      success: true,
      stats: {
        totalJobs: jobs.length,
        duplicateGroups: duplicates.length,
        deletedJobs: deletedCount
      },
      duplicateGroups: duplicates
    }
  } catch (error) {
    console.error('Failed to deduplicate:', error.message)
    throw error
  }
}

/**
 * Monitor deduplication progress
 */
export function formatDeduplicateResult(result) {
  if (!result.success) return `❌ ${result.error}`

  const { stats, duplicateGroups } = result
  const msg = `✅ ${stats.deletedJobs} doublons supprimés (${stats.duplicateGroups} groupes)`

  if (duplicateGroups.length > 0) {
    console.log('Merged duplicates:')
    duplicateGroups.forEach(group => {
      console.log(`  • ${group.company} / ${group.position}: kept ${group.primaryStatus}, deleted ${group.duplicateCount}`)
    })
  }

  return msg
}
