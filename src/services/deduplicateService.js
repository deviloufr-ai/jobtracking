import { getSyncUserIdForSupabase } from './gmail'

/**
 * Deduplicate jobs server-side via Vercel Function
 * Now that SUPABASE_SERVICE_ROLE_KEY is configured
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Vercel Function (server-side)...')

    const userId = getSyncUserIdForSupabase()
    if (!userId) {
      throw new Error('No user ID found. Please log in.')
    }

    console.log('✓ Using sync user ID:', userId)

    // Pass Supabase URL from client
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

    const response = await fetch('/api/deduplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, supabaseUrl })
    })

    console.log('Response status:', response.status)
    const result = await response.json()

    if (!response.ok) {
      console.error('Dedup error:', result)
      throw new Error(result.error || `HTTP ${response.status}: Deduplicate failed`)
    }

    console.log('✓ Deduplication complete:', result.stats)
    return result
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
