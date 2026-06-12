import { supabase } from './supabase'

/**
 * Call the deduplicate-jobs Vercel Function to clean duplicates server-side
 * Uses Vercel serverless function with SERVICE_ROLE_KEY for auth
 */
export async function deduplicateJobsViaEdgeFunction() {
  try {
    console.log('🔄 Calling deduplicate-jobs Vercel Function...')

    // Try multiple ways to get auth token
    let accessToken = null

    // 1. Try getSession()
    try {
      const { data } = await supabase.auth.getSession()
      accessToken = data?.session?.access_token
      if (accessToken) {
        console.log('✓ Got token from getSession()')
      }
    } catch (e) {
      console.warn('getSession() failed:', e.message)
    }

    // 2. If no token, try getUser() which might work even if getSession() doesn't
    if (!accessToken) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (user && !error) {
          console.log('✓ User found:', user.email)
          // If user exists, try once more to get session
          const { data } = await supabase.auth.getSession()
          accessToken = data?.session?.access_token
          if (accessToken) {
            console.log('✓ Got token after getUser()')
          }
        }
      } catch (e) {
        console.warn('getUser() also failed')
      }
    }

    if (!accessToken) {
      throw new Error('Could not obtain access token. You may need to re-login.')
    }

    console.log('✓ Got access token')

    // Call Vercel function (which has SERVICE_ROLE_KEY)
    const functionUrl = '/api/deduplicate'
    console.log('📤 POST to:', functionUrl)

    const response = await fetch(functionUrl, {
      method: 'POST',
      credentials: 'include', // Include cookies
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
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
