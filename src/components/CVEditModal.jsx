import { useState } from 'react'

// Edit the raw text of a base (source) CV — the text the generator adapts from.
// Shared by CVManager (Settings → My CV list) and BatchCVGenerator so the "edit
// the CV used for generation" action behaves identically wherever it's offered.
export default function CVEditModal({ cv, onSave, onClose, t = (key) => key }) {
  const [text, setText] = useState(cv?.text || '')
  if (!cv) return null

  const handleSave = () => {
    onSave(text)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('cvManagerUI.editTitle')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-gray-600 mb-3">{cv.name}</p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full h-[400px] text-sm border border-gray-200 rounded-lg p-3 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none"
          />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            ✓ {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
