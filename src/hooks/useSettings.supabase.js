import { useState, useCallback, useEffect } from 'react'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'
import { supabase } from '../services/supabase'

const SETTINGS_DEFAULTS = {
  weeklyApps: 5,
  responseRate: 30,
  monthlyInterviews: 3,
  archiveSentDays: 60,
  archiveRejectedDays: 90,
  followUpSentDays: 14,
  followUpReviewingDays: 10,
  followUpWaitingDays: 7,
  followUpOfferDays: 3,
  autoRefreshHours: 6,
  gmailPeriodMonths: 3,
  checkPositionAfterDays: 14,
  checkPositionEnabled: true,
}

// Load from localStorage as fallback (for migration period)
export function loadSettings() {
  try {
    const raw = localStorage.getItem('jobtrackr_settings')
    return raw ? { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) } : { ...SETTINGS_DEFAULTS }
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

function saveSettingsLocal(s) {
  try {
    localStorage.setItem('jobtrackr_settings', JSON.stringify(s))
    window.dispatchEvent(new CustomEvent('jobtrackr-settings-changed', { detail: s }))
  } catch {}
}

export function useSettings() {
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS)
  const [loading, setLoading] = useState(true)

  // Load from IndexedDB on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        await indexeddb.init()
        const cached = await indexeddb.getSettings()
        if (cached && Object.keys(cached).length > 0) {
          setSettings({ ...SETTINGS_DEFAULTS, ...cached })
        } else {
          // Fall back to localStorage
          const local = loadSettings()
          setSettings(local)
        }
      } catch (err) {
        console.error('Failed to load settings from IndexedDB:', err)
        const local = loadSettings()
        setSettings(local)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }

      // Save locally
      saveSettingsLocal(next)

      // Sync to Supabase
      indexeddb.saveSettings(next).catch(err => console.error('Failed to save settings to IndexedDB:', err))

      const user = supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          syncManager.mutate('user_settings', 'update', {
            user_id: data.user.id,
            ...next
          }).catch(err => console.error('Failed to sync settings:', err))
        }
      })

      return next
    })
  }, [])

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }

      // Save locally
      saveSettingsLocal(next)

      // Sync to Supabase
      indexeddb.saveSettings(next).catch(err => console.error('Failed to save settings to IndexedDB:', err))

      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          syncManager.mutate('user_settings', 'update', {
            user_id: data.user.id,
            ...next
          }).catch(err => console.error('Failed to sync settings:', err))
        }
      })

      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    saveSettingsLocal(SETTINGS_DEFAULTS)
    indexeddb.saveSettings(SETTINGS_DEFAULTS).catch(err => console.error('Failed to reset settings:', err))

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        syncManager.mutate('user_settings', 'update', {
          user_id: data.user.id,
          ...SETTINGS_DEFAULTS
        }).catch(err => console.error('Failed to sync settings reset:', err))
      }
    })

    setSettings({ ...SETTINGS_DEFAULTS })
  }, [])

  return { settings, updateSetting, updateSettings, resetSettings, loading }
}
