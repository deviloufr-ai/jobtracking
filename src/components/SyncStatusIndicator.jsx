// SyncStatusIndicator — floating badge that surfaces cross-device sync state.
//
// It reads live signals from two singletons that already drive sync:
//   • syncManager    — emits {status, queueSize} on online/offline/queue/flush
//   • syncCoordinator — emits {status, timestamp} on poll/init/datasync cycles
// Neither exposes queueSize + lastSynced together, so we merge both streams
// into one derived display state. Pure UI: no schema change, no network of its
// own beyond an optional manual "Sync now".
//
// Placement: bottom-left above the mobile bottom nav (the FAB owns bottom-right),
// bottom-right on desktop (the NavRail owns the left edge). Styling mirrors the
// NavRail chip conventions so the existing body.is-dark overrides apply.
import { useEffect, useRef, useState } from 'react'
import { getSyncCoordinator } from '../services/syncCoordinator'
import { syncManager } from '../services/syncManager'
import { isSupabaseConfigured } from './../services/supabase'

// Relative "last synced" string, composed from i18n templates (t() has no
// interpolation, so we replace {n} ourselves).
function relTime(ts, t) {
  if (!ts) return t('sync.never')
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return t('sync.relJustNow')
  if (m < 60) return t('sync.relMinutes').replace('{n}', m)
  const h = Math.floor(m / 60)
  if (h < 24) return t('sync.relHours').replace('{n}', h)
  return t('sync.relDays').replace('{n}', Math.floor(h / 24))
}

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
)
const SpinIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
)
const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
)
const OfflineIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636L5.636 18.364M8.111 8.11a5 5 0 00-1.087.72m10.865 6.45a9 9 0 00-2.02-1.516M4.222 9a12 12 0 012.196-1.636M12 20h.01" /></svg>
)
const AlertIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.929 19h14.142c1.54 0 2.502-1.667 1.732-3L13.732 4a2 2 0 00-3.464 0L3.197 16c-.77 1.333.192 3 1.732 3z" /></svg>
)

// state → chip classes + icon. Colored -50 backgrounds intentionally read as
// light chips in dark mode, matching NavRail's installed/extension chips.
const STYLES = {
  synced:   { chip: 'bg-green-50 text-green-700',   dot: 'bg-green-500',   Icon: CheckIcon },
  syncing:  { chip: 'bg-indigo-50 text-indigo-600', dot: 'bg-indigo-500',  Icon: SpinIcon },
  queued:   { chip: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500',   Icon: SpinIcon },
  offline:  { chip: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400',    Icon: OfflineIcon },
  error:    { chip: 'bg-red-50 text-red-700',       dot: 'bg-red-500',     Icon: AlertIcon },
  checking: { chip: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400',    Icon: ClockIcon },
}

export default function SyncStatusIndicator({ t = (k) => k }) {
  const [s, setS] = useState({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncing: false,
    queueSize: 0,
    error: null,
    lastSyncedAt: null,
  })
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [, setTick] = useState(0) // re-render for relative-time refresh
  const openRef = useRef(open)
  openRef.current = open

  // Merge status events from both singletons into one state shape.
  useEffect(() => {
    if (!isSupabaseConfigured()) return

    const handle = (u) => {
      if (!u || !u.status) return
      setS((prev) => {
        const next = { ...prev }
        if (typeof u.queueSize === 'number') next.queueSize = u.queueSize
        switch (u.status) {
          case 'online':  next.online = true; break
          case 'offline': next.online = false; break
          case 'syncing': next.online = true; next.syncing = true; next.error = null; break
          case 'synced':
            next.online = true
            next.syncing = false
            next.queueSize = 0
            next.error = null
            next.lastSyncedAt = u.timestamp ? new Date(u.timestamp).getTime() : Date.now()
            break
          case 'error':   next.error = u.error || 'error'; next.syncing = false; break
          default: break
        }
        return next
      })
    }

    const unsubs = []
    unsubs.push(syncManager.onStatusChange(handle))

    // The coordinator is created on auth, which may land after this mounts.
    // Poll for it until we've subscribed once, then stop.
    let coordUnsub = null
    const trySubscribeCoord = () => {
      if (coordUnsub) return
      const c = getSyncCoordinator()
      if (c) coordUnsub = c.onStatusChange(handle)
    }
    trySubscribeCoord()
    const coordTimer = coordUnsub ? null : setInterval(() => {
      trySubscribeCoord()
      if (coordUnsub) clearInterval(coordTimer)
    }, 2000)

    // Seed the initial queue depth (mutations that queued before we mounted).
    syncManager.getQueueSize?.().then((n) => {
      if (typeof n === 'number' && n > 0) setS((prev) => ({ ...prev, queueSize: n }))
    }).catch(() => {})

    const onOnline = () => setS((prev) => ({ ...prev, online: true }))
    const onOffline = () => setS((prev) => ({ ...prev, online: false }))
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const tick = setInterval(() => setTick((x) => x + 1), 30000)

    return () => {
      unsubs.forEach((fn) => fn && fn())
      if (coordUnsub) coordUnsub()
      if (coordTimer) clearInterval(coordTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(tick)
    }
  }, [])

  const state = !s.online ? 'offline'
    : s.error ? 'error'
    : s.queueSize > 0 ? 'queued'
    : s.syncing ? 'syncing'
    : s.lastSyncedAt ? 'synced'
    : 'checking'

  // Collapse the resting "synced" chip to a dot after a few seconds so it stops
  // competing for attention; any active state (or an open panel) keeps it full.
  useEffect(() => {
    if (state === 'synced' && !open) {
      const id = setTimeout(() => setCollapsed(true), 4000)
      return () => clearTimeout(id)
    }
    setCollapsed(false)
  }, [state, open])

  if (!isSupabaseConfigured()) return null
  // Stay invisible until there's a definite status — avoids a permanent
  // "Checking…" chip for signed-out sessions that never spin up a coordinator.
  if (state === 'checking' && !open) return null

  const { chip, dot, Icon } = STYLES[state]

  const label = state === 'queued'
    ? `${t('sync.queued')} ${s.queueSize} ${s.queueSize === 1 ? t('sync.item') : t('sync.items')}`
    : t(`sync.${state === 'error' ? 'failed' : state === 'checking' ? 'checking' : state === 'offline' ? 'offline' : state === 'syncing' ? 'syncing' : 'synced'}`)

  const statusText = state === 'queued' ? t('sync.queuedStatus')
    : state === 'error' ? t('sync.failed')
    : state === 'syncing' ? t('sync.syncing')
    : state === 'offline' ? t('sync.offline')
    : state === 'checking' ? t('sync.checking')
    : t('sync.synced')

  const canManualSync = s.online && state !== 'syncing'
  const onSyncNow = () => {
    const c = getSyncCoordinator()
    setS((prev) => ({ ...prev, syncing: true, error: null }))
    try {
      c?.poll?.()
      if (c?.userId) syncManager.flushQueue?.(c.userId)
    } catch { /* best effort */ }
  }

  return (
    <div className="fixed z-40 left-4 bottom-[4.75rem] md:left-auto md:right-4 md:bottom-4">
      {/* Detail panel */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 w-60 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">{t('sync.details')}</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-4 py-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{t('sync.statusLabel')}</span>
              <span className="font-medium text-gray-800">{statusText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{t('sync.lastSync')}</span>
              <span className="font-medium text-gray-800">{relTime(s.lastSyncedAt, t)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{t('sync.queueLabel')}</span>
              <span className="font-medium text-gray-800">{s.queueSize}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{t('sync.connection')}</span>
              <span className="font-medium text-gray-800">{s.online ? t('sync.online') : t('sync.offline')}</span>
            </div>
          </div>
          <div className="px-4 pb-3">
            <button
              onClick={onSyncNow}
              disabled={!canManualSync}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${state === 'syncing' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {state === 'error' ? t('sync.retry') : t('sync.syncNow')}
            </button>
          </div>
        </div>
      )}

      {/* Chip / dot */}
      {collapsed ? (
        <button
          onClick={() => setOpen(true)}
          aria-label={`${t('sync.ariaLabel')}: ${statusText}`}
          className={`w-8 h-8 flex items-center justify-center rounded-full shadow-md ${chip} transition-all active:scale-95`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={`${t('sync.ariaLabel')}: ${statusText}`}
          className={`flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-full shadow-md text-xs font-medium ${chip} transition-all active:scale-95`}
        >
          <Icon />
          <span className="whitespace-nowrap">{label}</span>
        </button>
      )}
    </div>
  )
}
