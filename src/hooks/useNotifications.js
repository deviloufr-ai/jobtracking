import { useState, useCallback } from 'react'

const STORAGE_KEY = 'jobtrackr_notifications'
const MAX_NOTIFICATIONS = 50

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save(notifications) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications)) } catch {}
}

export function useNotifications() {
  const [notifications, setNotifications] = useState(load)

  const push = useCallback((type, message, meta = {}) => {
    const notif = {
      id: crypto.randomUUID(),
      type,      // 'new_job' | 'update' | 'archive' | 'meeting' | 'info'
      message,
      meta,      // { company, count, jobId, ... }
      date: new Date().toISOString(),
      read: false,
    }
    setNotifications(prev => {
      const next = [notif, ...prev].slice(0, MAX_NOTIFICATIONS)
      save(next)
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }))
      save(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setNotifications([])
    save([])
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return { notifications, push, markAllRead, clear, unreadCount }
}
