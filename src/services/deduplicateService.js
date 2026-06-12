import { getSyncUserIdForSupabase } from './gmail'

/**
 * Call the deduplicate-jobs Vercel Function to clean duplicates server-side
 * Uses Vercel serverless function with SERVICE_ROLE_KEY for auth
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Vercel Function...')

    // Get sync user ID (same stable UUID used by SyncCoordinator)
    const userId = getSyncUserIdForSupabase()

    if (!userId) {
      throw new Error('No user ID found. Please log in.')
    }

    console.log('✓ Using sync user ID:', userId)

    // Call Vercel function (which has SERVICE_ROLE_KEY)
    const functionUrl = '/api/deduplicate'
    console.log('📤 POST to:', functionUrl)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId
      })
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
