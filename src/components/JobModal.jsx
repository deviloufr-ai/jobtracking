import { useState, useEffect } from 'react'
import { STATUSES } from '../hooks/useJobs'

const EMPTY = { company: '', position: '', url: '', status: 'sent', date: new Date().toISOString().split('T')[0], notes: '' }

export default function JobModal({ job, onSave, onClose, findDuplicate, t = (key) => key }) {
  const [form, setForm] = useState(job ? { ...job } : { ...EMPTY })
  const [urlWarning, setUrlWarning] = useState(false)
  const [duplicate, setDuplicate] = useState(null)
  const isEdit = !!job

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (isEdit || !form.company.trim() || !form.position.trim() || !findDuplicate) {
      setDuplicate(null)
      return
    }
    const dup = findDuplicate(form.company, form.position)
    setDuplicate(dup || null)
  }, [form.company, form.position, isEdit, findDuplicate])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleUrl = (v) => {
    set('url', v)
    if (v && !v.startsWith('http')) setUrlWarning(true)
    else setUrlWarning(false)
  }

  const handleSubmit = () => {
    if (!form.company.trim()) return
    onSave(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? t('jobModal.editTitle') : t('jobModal.newTitle')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-4">
          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('jobModal.companyLabel')} <span className="text-red-500">{t('jobModal.required')}</span>
            </label>
            <input
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder={t('jobModal.companyPlaceholder')}
              value={form.company}
              onChange={e => set('company', e.target.value)}
            />
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('jobModal.positionLabel')} <span className="text-red-500">{t('jobModal.required')}</span>
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder={t('jobModal.positionPlaceholder')}
              value={form.position}
              onChange={e => set('position', e.target.value)}
            />
          </div>

          {/* URL + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobModal.urlLabel')}</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="https://..."
                value={form.url}
                onChange={e => handleUrl(e.target.value)}
              />
              {urlWarning && <p className="text-xs text-orange-500 mt-1">{t('jobModal.urlInvalid')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobModal.dateLabel')}</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.date}
                onChange={e => set('date', e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobModal.statusLabel')}</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              value={form.status}
              onChange={e => set('status', e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('jobModal.notesLabel')}</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              rows={3}
              placeholder={t('jobModal.notesPlaceholder')}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {/* Duplicate warning */}
          {duplicate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">{t('jobModal.duplicateWarning')}</p>
              <p className="text-xs text-amber-700 mt-1">
                {t('jobModal.duplicateText')
                  .replace('{company}', duplicate.company)
                  .replace('{position}', duplicate.position)
                  .replace('{status}', duplicate.status ? STATUSES.find(s => s.key === duplicate.status)?.label : 'Unknown')}
              </p>
              <p className="text-xs text-amber-600 mt-2">{t('jobModal.duplicateAsk')}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('jobModal.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.company.trim() || !form.position.trim()}
            className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEdit ? t('jobModal.save') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
