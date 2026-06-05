import { useState, useCallback } from 'react'

const STORAGE_KEY = 'jobtrackr_settings'

export const SETTINGS_DEFAULTS = {
  // Goals
  weeklyApps: 5,
  responseRate: 30,
  monthlyInterviews: 3,
  // Auto-archive
  archiveSentDays: 60,
  archiveRejectedDays: 90,
  // Follow-up reminders
  followUpSentDays: 14,
  followUpReviewingDays: 10,
  followUpWaitingDays: 7,
  followUpOfferDays: 3,
  // Gmail sync
  autoRefreshHours: 6,
  gmailPeriodMonths: 3,
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) } : { ...SETTINGS_DEFAULTS }
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings)

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      saveSettings(next)
      return next
    })
  }, [])

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    saveSettings(SETTINGS_DEFAULTS)
    setSettings({ ...SETTINGS_DEFAULTS })
  }, [])

  return { settings, updateSetting, updateSettings, resetSettings }
}
