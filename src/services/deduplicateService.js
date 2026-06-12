import { supabase } from './supabase'

/**
 * Call the deduplicate-jobs Edge Function to clean duplicates server-side
 * This is more efficient than doing it on the client
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Edge Function...')

    // Get current session
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('Session error:', error)
      throw new Error(`Failed to get session: ${error.message}`)
    }

    const session = data?.session
    if (!session) {
      throw new Error('Not logged in - please login first')
    }

    if (!session.access_token) {
      throw new Error('No access token available')
    }

    console.log('✓ Session found, calling Edge Function...')

    // Call the Edge Function with auth header
    const supabaseUrl = supabase.supabaseUrl
    const functionUrl = `${supabaseUrl}/functions/v1/deduplicate-jobs`
    console.log('📤 POST to:', functionUrl)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    })

    console.log('Response status:', response.status)
    const result = await response.json()

    if (!response.ok) {
      console.error('Edge Function error:', result)
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
