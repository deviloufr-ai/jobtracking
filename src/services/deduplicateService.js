import { supabase } from './supabase'

/**
 * Call the deduplicate-jobs Edge Function to clean duplicates server-side
 * This is more efficient than doing it on the client
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Edge Function...')

    // Get current user (more reliable than getSession)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) {
      console.error('Auth error:', userError)
      throw new Error(`Auth failed: ${userError.message}`)
    }

    if (!user) {
      throw new Error('Not logged in - please login first')
    }

    console.log('✓ User found:', user.id)

    // Get session for access token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      console.warn('Session error (will try without token):', sessionError?.message)
    }

    const accessToken = session?.access_token
    if (!accessToken) {
      throw new Error('No access token - session may have expired')
    }

    console.log('✓ Access token found')

    // Call the Edge Function with auth header
    const supabaseUrl = supabase.supabaseUrl
    const functionUrl = `${supabaseUrl}/functions/v1/deduplicate-jobs`
    console.log('📤 POST to:', functionUrl)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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
