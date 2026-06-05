import { useState, useRef, useEffect } from 'react'

const TYPE_CONFIG = {
  new_job:  { icon: '✨', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  update:   { icon: '↻',  color: 'text-blue-600',   bg: 'bg-blue-50' },
  archive:  { icon: '📦', color: 'text-gray-500',   bg: 'bg-gray-50' },
  meeting:  { icon: '📅', color: 'text-orange-600', bg: 'bg-orange-50' },
  info:     { icon: 'ℹ️', color: 'text-gray-500',   bg: 'bg-gray-50' },
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'à l\'instant'
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)}h`
  return `il y a ${Math.round(diff / 86400)}j`
}

export default function NotificationBell({ notifications, unreadCount, onMarkAllRead, onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    setOpen(v => !v)
    if (!open && unreadCount > 0) onMarkAllRead()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        title="Notifications"
        className="relative flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                  Tout effacer
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm text-gray-400">Aucune notification</p>
              </div>
            ) : (
              notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info
                return (
                  <div key={n.id} className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${!n.read ? 'bg-blue-50/30' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${cfg.bg}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 leading-snug">{n.message}</p>
                      {n.meta?.company && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{n.meta.company}</p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-1">{timeAgo(n.date)}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
