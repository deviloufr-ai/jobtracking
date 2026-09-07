import { useState, useMemo } from 'react'
import { isNoReply } from './EmailDraft'

// Per-application networking mini-CRM. Managed contacts (name, role, email, phone,
// LinkedIn, notes) with a touchpoint log and a "reconnect" nudge live on
// job.contacts (synced via extras). Contacts detected in the email timeline are
// offered as one-click suggestions, so the Gmail import seeds the CRM. Persists
// through onUpdateJob(job.id, { contacts }).

const RECONNECT_DAYS = 14
const TOUCH_TYPES = ['email', 'call', 'meeting', 'linkedin', 'other']
const DAY = 86400000

const genId = () => { try { return crypto.randomUUID() } catch { return `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` } }
const initial = (s = '') => s.trim()[0]?.toUpperCase() || '?'

// Parse "Name <email>" / "email" out of a timeline entry's `from`.
function parseFrom(raw) {
  if (!raw) return null
  const s = raw.trim()
  const m = s.match(/^([^<]+)<([^>]+)>/)
  if (m) return { name: m[1].trim(), email: m[2].trim() }
  if (s.includes('@')) return { name: s.split('@')[0], email: s }
  return null
}

export default function ContactsManager({ job, onUpdateJob, t = (k) => k }) {
  const tx = (k, f) => { const v = t(k); return v && v !== k ? v : f }
  const contacts = useMemo(() => Array.isArray(job.contacts) ? job.contacts : [], [job.contacts])
  const [editingId, setEditingId] = useState(null)   // contact id being edited, or 'new'
  const [form, setForm] = useState({})
  const [expandedId, setExpandedId] = useState(null)  // contact whose touchpoints are shown
  const [touchDraft, setTouchDraft] = useState({})    // contactId -> { type, note }
  // Captured once (useState initializer is exempt from render purity) so recency
  // labels stay stable for the drawer's lifetime instead of recomputing "now".
  const [nowTs] = useState(() => Date.now())

  // Email-detected people not yet saved as managed contacts (by email).
  const suggestions = useMemo(() => {
    const known = new Set(contacts.map(c => (c.email || '').toLowerCase()).filter(Boolean))
    const seen = new Map()
    for (const h of (job.history || [])) {
      if (h.fromMe || !h.from) continue
      const p = parseFrom(h.from)
      if (!p || !p.email || isNoReply(p.email)) continue
      const key = p.email.toLowerCase()
      if (known.has(key) || seen.has(key)) continue
      seen.set(key, { ...p, date: h.date })
    }
    return [...seen.values()]
  }, [job.history, contacts])

  const jobActive = !['archived', 'rejected', 'rejected_ats', 'cancelled'].includes(job.status)

  // Per-contact recency, derived once per render. `Date.now()` lives inside the
  // memo (not the render body) to keep the component pure — reads below are cheap
  // lookups by contact id.
  const recency = useMemo(() => {
    const map = {}
    for (const c of contacts) {
      const dates = (c.touchpoints || []).map(tp => new Date(tp.date).getTime()).filter(Number.isFinite)
      const ts = dates.length ? Math.max(...dates) : (c.createdAt ? new Date(c.createdAt).getTime() : null)
      const days = ts ? Math.floor((nowTs - ts) / DAY) : null
      map[c.id] = { ts, days, due: jobActive && days !== null && days >= RECONNECT_DAYS }
    }
    return map
  }, [contacts, jobActive, nowTs])

  const persist = (next) => onUpdateJob?.(job.id, { contacts: next })

  const startNew = (seed = {}) => { setForm({ name: '', role: '', email: '', phone: '', linkedin: '', notes: '', ...seed }); setEditingId('new') }
  const startEdit = (c) => { setForm({ ...c }); setEditingId(c.id) }

  const saveContact = () => {
    if (!(form.name || form.email)) return
    if (editingId === 'new') {
      const c = { id: genId(), touchpoints: [], createdAt: new Date().toISOString(), ...form }
      persist([...contacts, c])
    } else {
      persist(contacts.map(c => c.id === editingId ? { ...c, ...form } : c))
    }
    setEditingId(null); setForm({})
  }

  const removeContact = (id) => persist(contacts.filter(c => c.id !== id))

  const addTouch = (id) => {
    const d = touchDraft[id] || {}
    const entry = { id: genId(), date: new Date().toISOString(), type: d.type || 'email', note: (d.note || '').trim() }
    persist(contacts.map(c => c.id === id ? { ...c, touchpoints: [entry, ...(c.touchpoints || [])] } : c))
    setTouchDraft(s => ({ ...s, [id]: { type: 'email', note: '' } }))
  }

  // Pure: turns a precomputed day-count into a human label.
  const timeAgo = (d) => {
    if (d === null || d === undefined) return ''
    if (d <= 0) return tx('contacts.today', 'today')
    if (d === 1) return tx('contacts.yesterday', 'yesterday')
    return tx('contacts.daysAgo', '{n}d ago').replace('{n}', String(d))
  }

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelCls = 'block text-[11px] font-semibold text-gray-500 mb-1'

  return (
    <div className="mb-6 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">👤 {tx('contacts.title', 'Contacts')}</h3>
        {editingId !== 'new' && (
          <button onClick={() => startNew()} className="text-xs font-medium text-indigo-600 hover:underline">+ {tx('contacts.add', 'Add contact')}</button>
        )}
      </div>

      {/* Managed contacts */}
      <div className="space-y-2">
        {contacts.map(c => {
          const { days, due } = recency[c.id] || { days: null, due: false }
          const isEditing = editingId === c.id
          const expanded = expandedId === c.id
          const td = touchDraft[c.id] || { type: 'email', note: '' }
          if (isEditing) return <ContactForm key={c.id} form={form} setForm={setForm} onSave={saveContact} onCancel={() => { setEditingId(null); setForm({}) }} tx={tx} inputCls={inputCls} labelCls={labelCls} />
          return (
            <div key={c.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-2.5">
                <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">{initial(c.name || c.email)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800 truncate">{c.name || c.email}</span>
                    {c.role && <span className="text-[11px] text-gray-400 truncate">· {c.role}</span>}
                    {due && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">🔔 {tx('contacts.reconnect', 'Reconnect')}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {c.email && <a href={`mailto:${c.email}`} className="text-xs text-indigo-600 hover:underline truncate">{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="text-xs text-gray-500 hover:underline">{c.phone}</a>}
                    {c.linkedin && <a href={/^https?:\/\//.test(c.linkedin) ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">LinkedIn ↗</a>}
                  </div>
                  {c.notes && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{c.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                    <span>{tx('contacts.lastContact', 'Last contact')}: {timeAgo(days) || '—'}</span>
                    <button onClick={() => setExpandedId(expanded ? null : c.id)} className="text-indigo-500 hover:underline">
                      {expanded ? tx('contacts.hideLog', 'Hide log') : `${tx('contacts.log', 'Log')}${(c.touchpoints?.length) ? ` (${c.touchpoints.length})` : ''}`}
                    </button>
                    <button onClick={() => startEdit(c)} className="text-gray-400 hover:text-gray-600">{tx('common.edit', 'Edit')}</button>
                    <button onClick={() => removeContact(c.id)} className="text-gray-400 hover:text-red-500">{tx('common.delete', 'Delete')}</button>
                  </div>

                  {expanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100">
                      <div className="flex gap-1.5 mb-2">
                        <select value={td.type} onChange={e => setTouchDraft(s => ({ ...s, [c.id]: { ...td, type: e.target.value } }))} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                          {TOUCH_TYPES.map(tt => <option key={tt} value={tt}>{tx(`contacts.type.${tt}`, tt)}</option>)}
                        </select>
                        <input value={td.note} onChange={e => setTouchDraft(s => ({ ...s, [c.id]: { ...td, note: e.target.value } }))}
                          placeholder={tx('contacts.touchPlaceholder', 'What happened?')} className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" />
                        <button onClick={() => addTouch(c.id)} className="text-xs font-semibold text-white bg-indigo-600 rounded-lg px-2.5 py-1.5 hover:bg-indigo-700">{tx('contacts.logIt', 'Log')}</button>
                      </div>
                      {(c.touchpoints || []).length === 0 ? (
                        <p className="text-[11px] text-gray-400">{tx('contacts.noTouches', 'No touchpoints logged yet.')}</p>
                      ) : (
                        <ul className="space-y-1">
                          {c.touchpoints.map(tp => (
                            <li key={tp.id} className="text-[11px] text-gray-600 flex gap-1.5">
                              <span className="text-gray-400 shrink-0">{new Date(tp.date).toLocaleDateString()}</span>
                              <span className="font-medium shrink-0">{tx(`contacts.type.${tp.type}`, tp.type)}</span>
                              {tp.note && <span className="text-gray-500 truncate">— {tp.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {editingId === 'new' && (
          <ContactForm form={form} setForm={setForm} onSave={saveContact} onCancel={() => { setEditingId(null); setForm({}) }} tx={tx} inputCls={inputCls} labelCls={labelCls} />
        )}
      </div>

      {/* Email-detected suggestions */}
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">{tx('contacts.suggested', 'Detected in your emails')}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button key={s.email} onClick={() => startNew({ name: s.name, email: s.email })}
                className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-full pl-1 pr-2 py-0.5 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold flex items-center justify-center">{initial(s.name || s.email)}</span>
                {s.name || s.email} <span className="text-indigo-400">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {contacts.length === 0 && editingId !== 'new' && suggestions.length === 0 && (
        <p className="text-xs text-gray-400">{tx('contacts.empty', 'No contacts yet. Add recruiters, hiring managers or referrals to track your network.')}</p>
      )}
    </div>
  )
}

function ContactForm({ form, setForm, onSave, onCancel, tx, inputCls, labelCls }) {
  const field = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="rounded-xl bg-indigo-50/50 border border-indigo-100 p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>{tx('contacts.name', 'Name')}</label>
          <input value={form.name ?? ''} onChange={e => field('name', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{tx('contacts.role', 'Role')}</label>
          <input value={form.role ?? ''} onChange={e => field('role', e.target.value)} placeholder={tx('contacts.rolePlaceholder', 'Recruiter, Hiring Manager…')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{tx('contacts.email', 'Email')}</label>
          <input value={form.email ?? ''} onChange={e => field('email', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{tx('contacts.phone', 'Phone')}</label>
          <input value={form.phone ?? ''} onChange={e => field('phone', e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{tx('contacts.linkedin', 'LinkedIn')}</label>
        <input value={form.linkedin ?? ''} onChange={e => field('linkedin', e.target.value)} placeholder="linkedin.com/in/…" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{tx('contacts.notes', 'Notes')}</label>
        <textarea value={form.notes ?? ''} onChange={e => field('notes', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!(form.name || form.email)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:brightness-105 transition disabled:opacity-40">
          {tx('common.save', 'Save')}
        </button>
        <button onClick={onCancel} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
          {tx('common.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  )
}
