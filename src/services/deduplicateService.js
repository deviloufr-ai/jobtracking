import { supabase } from './supabase'

/**
 * Call the deduplicate-jobs Vercel Function to clean duplicates server-side
 * Uses Vercel serverless function with SERVICE_ROLE_KEY for auth
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Vercel Function...')

    // Get user ID from Supabase auth
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (!user || userError) {
      throw new Error('Not authenticated. Please log in.')
    }

    console.log('✓ Authenticated as:', user.email)

    // Call Vercel function (which has SERVICE_ROLE_KEY)
    const functionUrl = '/api/deduplicate'
    console.log('📤 POST to:', functionUrl, 'for user:', user.id)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id
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
