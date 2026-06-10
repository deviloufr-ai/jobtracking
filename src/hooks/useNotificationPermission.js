import { useState, useEffect, useCallback } from 'react'

const PERMISSION_STORAGE_KEY = 'jobtrackr_notif_permission'
const BANNER_DISMISSED_KEY = 'jobtrackr_notif_banner_dismissed'
const BANNER_DISMISS_TIME_KEY = 'jobtrackr_notif_banner_dismiss_time'

function getBrowserPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState(() => {
    const stored = localStorage.getItem(PERMISSION_STORAGE_KEY)
    return stored || 'default'
  })

  const [bannerDismissed, setBannerDismissed] = useState(() => {
    const stored = localStorage.getItem(BANNER_DISMISSED_KEY)
    if (!stored) return false
    const dismissTime = parseInt(localStorage.getItem(BANNER_DISMISS_TIME_KEY) || '0')
    const thirtySecondsAgo = Date.now() - 3 * 24 * 60 * 60 * 1000 // 3 days
    if (dismissTime < thirtySecondsAgo) {
      localStorage.removeItem(BANNER_DISMISSED_KEY)
      localStorage.removeItem(BANNER_DISMISS_TIME_KEY)
      return false
    }
    return true
  })

  // Detect actual browser permission on mount and when it changes
  useEffect(() => {
    const checkPermission = () => {
      const actual = getBrowserPermission()
      setPermission(actual)
      localStorage.setItem(PERMISSION_STORAGE_KEY, actual)
    }

    checkPermission()

    // Some browsers don't support permission change events, so we poll
    const interval = setInterval(checkPermission, 5000)
    return () => clearInterval(interval)
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      localStorage.setItem(PERMISSION_STORAGE_KEY, result)
      return result
    } catch (err) {
      console.error('Notification permission error:', err)
    }
  }, [])

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true)
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true')
    localStorage.setItem(BANNER_DISMISS_TIME_KEY, Date.now().toString())
  }, [])

  const shouldShowBanner = permission === 'default' && !bannerDismissed

  return {
    permission,
    shouldShowBanner,
    dismissBanner,
    requestPermission,
  }
}

export function getTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function isWithinNotificationHours(timezone = 'UTC') {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  })
  const hourStr = formatter.format(now)
  const hour = parseInt(hourStr, 10)
  return hour >= 8 && hour < 20
}

export function sendBrowserNotification(title, options = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return
  }

  try {
    new Notification(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      ...options,
    })
  } catch (err) {
    console.error('Error sending notification:', err)
  }
}
