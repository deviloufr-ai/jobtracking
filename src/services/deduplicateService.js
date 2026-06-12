import { supabase } from './supabase'

/**
 * Call the deduplicate-jobs Edge Function to clean duplicates server-side
 * This is more efficient than doing it on the client
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Edge Function...')

    // Try to get access token from multiple sources
    let accessToken = null

    // 1. Try getSession() first (most reliable)
    try {
      const { data } = await supabase.auth.getSession()
      accessToken = data?.session?.access_token
      if (accessToken) {
        console.log('✓ Got token from getSession()')
      }
    } catch (e) {
      console.warn('getSession() failed, trying localStorage...')
    }

    // 2. If no session, try localStorage (Supabase stores it there)
    if (!accessToken) {
      const projectId = supabase.supabaseUrl.split('//')[1].split('.')[0]
      const storageKey = `sb-${projectId}-auth-token`
      const stored = localStorage.getItem(storageKey)

      if (stored) {
        try {
          const authData = JSON.parse(stored)
          accessToken = authData?.session?.access_token
          if (accessToken) {
            console.log('✓ Got token from localStorage')
          }
        } catch (e) {
          console.warn('Failed to parse localStorage token:', e.message)
        }
      }
    }

    if (!accessToken) {
      throw new Error('No access token found - please login first')
    }

    console.log('✓ Access token acquired')

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
