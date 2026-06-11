import { supabase } from './supabase'
import { indexeddb } from './indexeddb'

// Check if user has localStorage data that needs migration
export async function checkLocalDataExists() {
  try {
    const jobs = JSON.parse(localStorage.getItem('jobtrackr_applications') || '[]')
    const settings = JSON.parse(localStorage.getItem('jobtrackr_settings') || '{}')
    const cvs = JSON.parse(localStorage.getItem('jobtrackr_cvs') || '[]')

    return {
      hasJobs: jobs.length > 0,
      hasSettings: Object.keys(settings).length > 0,
      hasCVs: cvs.length > 0,
      jobsCount: jobs.length,
      jobs,
      settings,
      cvs
    }
  } catch (err) {
    console.error('Error checking local data:', err)
    return {
      hasJobs: false,
      hasSettings: false,
      hasCVs: false,
      jobsCount: 0,
      jobs: [],
      settings: {},
      cvs: []
    }
  }
}

// Check if user has already been migrated
export async function isUserMigrated(userId) {
  try {
    const { data, error } = await supabase
      .from('user_metadata')
      .select('migrated_at')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (new user)
      console.error('Error checking migration status:', error)
      return false
    }

    return data?.migrated_at != null
  } catch (err) {
    console.error('Error checking migration:', err)
    return false
  }
}

// Migrate jobs from localStorage to Supabase
export async function migrateJobs(userId, jobs) {
  if (jobs.length === 0) return { success: true, count: 0 }

  try {
    const jobsToInsert = jobs.map(job => ({
      user_id: userId,
      company: job.company,
      position: job.position,
      url: job.url || null,
      status: job.status,
      notes: job.notes || '',
      date: job.date,
      favorite: job.favorite || false,
      enriched_at: job.enriched_at || null,
      version: 1,
      device_id: localStorage.getItem('device_id') || null,
      last_modified_at: new Date().toISOString()
    }))

    const { data, error } = await supabase
      .from('jobs')
      .insert(jobsToInsert)
      .select('id')

    if (error) {
      console.error('Error migrating jobs:', error)
      throw error
    }

    // Migrate job history entries
    const historyEntries = []
    jobs.forEach((job, jobIndex) => {
      if (job.history && Array.isArray(job.history)) {
        job.history.forEach(entry => {
          historyEntries.push({
            job_id: data[jobIndex].id, // Map to new job ID
            user_id: userId,
            date: entry.date,
            status: entry.status || null,
            note: entry.note || null,
            meeting_link: entry.meetingLink || null,
            gmail_id: entry.gmailId || null,
            gmail_ids: entry.gmailIds || null,
            offer_url: entry.offerUrl || null,
            show_cv_button: entry.showCVButton || false,
            from_email: entry.from || null,
            from_me: entry.fromMe || false,
            source: entry.source || null,
            raw_start: entry.rawStart || null,
            version: 1,
            device_id: localStorage.getItem('device_id') || null,
            last_modified_at: new Date().toISOString()
          })
        })
      }
    })

    if (historyEntries.length > 0) {
      const { error: historyError } = await supabase
        .from('job_history')
        .insert(historyEntries)

      if (historyError) {
        console.error('Error migrating job history:', historyError)
        // Don't throw - history is secondary
      }
    }

    return { success: true, count: jobs.length }
  } catch (err) {
    console.error('Error migrating jobs:', err)
    throw err
  }
}

// Migrate CVs from localStorage to Supabase
export async function migrateCVs(userId, cvs) {
  if (cvs.length === 0) return { success: true, count: 0 }

  try {
    const cvsToInsert = cvs.map(cv => ({
      user_id: userId,
      name: cv.name,
      content_raw: cv.text || cv.content_raw || '',
      version: 1,
      device_id: localStorage.getItem('device_id') || null,
      last_modified_at: new Date().toISOString()
    }))

    const { error } = await supabase
      .from('cvs')
      .insert(cvsToInsert)

    if (error) {
      console.error('Error migrating CVs:', error)
      throw error
    }

    return { success: true, count: cvs.length }
  } catch (err) {
    console.error('Error migrating CVs:', err)
    throw err
  }
}

// Migrate settings from localStorage to Supabase
export async function migrateSettings(userId, settings) {
  try {
    // Create default settings first
    const settingsData = {
      user_id: userId,
      weekly_apps: settings.weeklyApps || 5,
      response_rate: settings.responseRate || 30,
      monthly_interviews: settings.monthlyInterviews || 3,
      archive_sent_days: settings.archiveSentDays || 60,
      archive_rejected_days: settings.archiveRejectedDays || 90,
      follow_up_sent_days: settings.followUpSentDays || 14,
      follow_up_reviewing_days: settings.followUpReviewingDays || 10,
      follow_up_waiting_days: settings.followUpWaitingDays || 7,
      follow_up_offer_days: settings.followUpOfferDays || 3,
      auto_refresh_hours: settings.autoRefreshHours || 6,
      gmail_period_months: settings.gmailPeriodMonths || 3,
      check_position_after_days: settings.checkPositionAfterDays || 14,
      check_position_enabled: settings.checkPositionEnabled !== false,
      version: 1,
      device_id: localStorage.getItem('device_id') || null,
      last_modified_at: new Date().toISOString()
    }

    // Try to insert, if it exists already just update
    const { data, error } = await supabase
      .from('user_settings')
      .upsert(settingsData, { onConflict: 'user_id' })

    if (error) {
      console.error('Error migrating settings:', error)
      throw error
    }

    return { success: true }
  } catch (err) {
    console.error('Error migrating settings:', err)
    throw err
  }
}

// Migrate profile picture
export async function migrateProfilePicture(userId) {
  try {
    const profilePic = localStorage.getItem('cv_profile_picture')
    if (!profilePic) return { success: true }

    const { error } = await supabase
      .from('user_metadata')
      .upsert({
        user_id: userId,
        profile_picture: profilePic
      }, { onConflict: 'user_id' })

    if (error && error.code !== 'PGRST116') {
      console.error('Error migrating profile picture:', error)
      return { success: false }
    }

    return { success: true }
  } catch (err) {
    console.error('Error migrating profile picture:', err)
    return { success: false }
  }
}

// Mark user as migrated
export async function markUserMigrated(userId) {
  try {
    const { error } = await supabase
      .from('user_metadata')
      .upsert({
        user_id: userId,
        migrated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    if (error) {
      console.error('Error marking user as migrated:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('Error marking user as migrated:', err)
    return false
  }
}

// Main migration orchestrator
export async function performMigration(userId, onProgress) {
  try {
    // Check if already migrated
    const alreadyMigrated = await isUserMigrated(userId)
    if (alreadyMigrated) {
      onProgress?.('User already migrated', 100)
      return { success: true, skipped: true }
    }

    // Check local data
    const localData = await checkLocalDataExists()
    const totalItems = localData.jobsCount + (localData.hasCVs ? localData.cvs.length : 0) + 1 // jobs + cvs + settings

    if (!localData.hasJobs && !localData.hasSettings && !localData.hasCVs) {
      // New user, no migration needed
      await markUserMigrated(userId)
      onProgress?.('No local data found - fresh start', 100)
      return { success: true, new_user: true }
    }

    let completed = 0

    // Migrate jobs
    if (localData.hasJobs) {
      onProgress?.(`Migrating ${localData.jobsCount} jobs...`, Math.round((completed / totalItems) * 100))
      await migrateJobs(userId, localData.jobs)
      completed += localData.jobsCount
      onProgress?.(`Migrated jobs`, Math.round((completed / totalItems) * 100))
    }

    // Migrate CVs
    if (localData.hasCVs) {
      onProgress?.(`Migrating ${localData.cvs.length} CVs...`, Math.round((completed / totalItems) * 100))
      await migrateCVs(userId, localData.cvs)
      completed += localData.cvs.length
      onProgress?.(`Migrated CVs`, Math.round((completed / totalItems) * 100))
    }

    // Migrate settings
    if (localData.hasSettings) {
      onProgress?.('Migrating settings...', Math.round((completed / totalItems) * 100))
      await migrateSettings(userId, localData.settings)
      completed += 1
      onProgress?.('Migrated settings', Math.round((completed / totalItems) * 100))
    }

    // Migrate profile picture
    await migrateProfilePicture(userId)

    // Mark as migrated
    await markUserMigrated(userId)

    // Populate IndexedDB cache with all jobs + history from Supabase
    onProgress?.('Loading data from cloud...', 95)
    try {
      const { data: allJobs } = await supabase
        .from('jobs')
        .select('*')
        .eq('user_id', userId)

      const { data: allHistory } = await supabase
        .from('job_history')
        .select('*')
        .eq('user_id', userId)

      // Map history by job_id
      const historyByJobId = new Map()
      if (allHistory) {
        allHistory.forEach(entry => {
          if (!historyByJobId.has(entry.job_id)) {
            historyByJobId.set(entry.job_id, [])
          }
          historyByJobId.get(entry.job_id).push(entry)
        })
      }

      // Save jobs with history to IndexedDB
      if (allJobs) {
        for (const job of allJobs) {
          const jobWithHistory = {
            ...job,
            history: historyByJobId.get(job.id) || []
          }
          await indexeddb.saveJob(jobWithHistory)
        }
      }

      // Save settings and CVs to IndexedDB
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (userSettings) {
        await indexeddb.saveSettings(userSettings)
      }

      const { data: userCVs } = await supabase
        .from('cvs')
        .select('*')
        .eq('user_id', userId)

      if (userCVs) {
        for (const cv of userCVs) {
          await indexeddb.saveCV(cv)
        }
      }
    } catch (err) {
      console.error('Error populating IndexedDB cache:', err)
      // Don't fail migration if cache population fails
    }

    onProgress?.('Migration complete!', 100)

    return {
      success: true,
      migrated: {
        jobs: localData.jobsCount,
        cvs: localData.cvs.length,
        settings: localData.hasSettings
      }
    }
  } catch (err) {
    console.error('Migration failed:', err)
    onProgress?.(`Migration failed: ${err.message}`, 0, true)
    throw err
  }
}
