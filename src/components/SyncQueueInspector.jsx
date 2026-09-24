import { useCallback, useEffect, useState } from 'react'
import { indexeddb } from '../services/indexeddb'
import { syncManager } from '../services/syncManager'
import { getSyncCoordinator } from '../services/syncCoordinator'

// Settings → Debug: the writes that have not reached the server yet. Each queued
// mutation carries the attempt count / last error that flushQueue records, so a
// stuck write is visible here instead of only in the console. "Retry now" runs
// the same flush the poll runs; "Discard" drops one row (the local copy stays and
// the next edit of that record re-sends it whole).

const label = (m) => {
  const r = m.record || {}
  if (m.table === 'jobs') return [r.company, r.position].filter(Boolean).join(' · ') || r.id || '—'
  if (m.table === 'cvs') return r.name || r.id || '—'
  return m.table
}
const when = (ts) => { try { return new Date(ts).toLocaleString() } catch { return '' } }

export default function SyncQueueInspector({ t = (k) => k }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setRows(await indexeddb.getQueuedMutations()) } catch { setRows([]) }
  }, [])

  useEffect(() => {
    // Deferred so the initial read isn't a synchronous setState inside the effect.
    const initial = setTimeout(load, 0)
    // flushQueue notifies on every removal/failure — refresh the list on each.
    const unsubscribe = syncManager.onStatusChange(() => { load() })
    return () => { clearTimeout(initial); unsubscribe() }
  }, [load])

  const retryAll = async () => {
    setBusy(true)
    try { await syncManager.flushQueue(getSyncCoordinator()?.userId) } catch { /* surfaced per row */ }
    setBusy(false)
    load()
  }

  const discard = async (id) => {
    if (!window.confirm(t('settingsDebug.queueDiscardConfirm'))) return
    try { await indexeddb.removeFromQueue(id) } catch { /* best effort */ }
    load()
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">✅ {t('settingsDebug.queueEmpty')}</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-700 font-medium">{rows.length} {t('settingsDebug.queuePending')}</span>
        <button onClick={retryAll} disabled={busy}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60">
          {busy ? '⏳' : '🔁'} {t('settingsDebug.queueRetryAll')}
        </button>
      </div>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {rows.map((m) => (
          <li key={m.id} className="flex items-start gap-3 px-3 py-2">
            <span className={`mt-0.5 shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${m.type === 'delete' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
              {m.type}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-900 truncate">{label(m)}</div>
              <div className="text-[11px] text-gray-500">
                {t('settingsDebug.queueQueuedAt')} {when(m.timestamp)}
                {' · '}
                {m.attempts
                  ? `${m.attempts}/${syncManager.maxRetries} ${t('settingsDebug.queueAttempts')}`
                  : t('settingsDebug.queueNeverTried')}
              </div>
              {m.lastError && (
                <div className="text-[11px] text-red-600 break-words mt-0.5" title={m.lastError}>
                  {String(m.lastError).slice(0, 160)}
                </div>
              )}
            </div>
            <button onClick={() => discard(m.id)}
              className="shrink-0 text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
              {t('settingsDebug.queueDiscard')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
