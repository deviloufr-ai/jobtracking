// Shown when the installed SmartJobTracker browser extension is behind the latest
// released version (see useExtensionUpdate). Offers the signed .xpi download and
// walks the user through installing it over their current build.
import { useDragDock } from '../hooks/useDragDock'
import { EXTENSION_XPI_PATH } from '../constants/extension'

export default function ExtensionUpdateModal({ installedVersion, latestVersion, onUpdate, onClose, t = (k) => k }) {
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 448 })
  const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)

  const steps = [
    t('extensionUpdate.step1'),
    t('extensionUpdate.step2'),
    t('extensionUpdate.step3'),
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {snapPreview}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden max-h-[90vh] flex flex-col" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="px-6 pt-6 pb-4 bg-gradient-to-br from-orange-500 to-amber-500 text-white cursor-move select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">🦊</div>
            <div>
              <h2 className="font-bold text-lg leading-tight">{t('extensionUpdate.title')}</h2>
            </div>
          </div>
          <p className="text-sm text-orange-50 mt-3 leading-relaxed">{t('extensionUpdate.intro')}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {/* Version diff */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t('extensionUpdate.current')}</p>
              <p className="text-sm font-mono font-semibold text-gray-500 mt-0.5">v{installedVersion || '—'}</p>
            </div>
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            <div className="text-center">
              <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider">{t('extensionUpdate.latest')}</p>
              <p className="text-sm font-mono font-bold text-orange-600 mt-0.5">v{latestVersion}</p>
            </div>
          </div>

          {/* How to update */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('extensionUpdate.howTo')}</p>
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-sm text-gray-600 leading-relaxed">{s}</p>
              </li>
            ))}
          </ol>

          {/* Download CTA */}
          <a
            href={EXTENSION_XPI_PATH}
            onClick={onUpdate}
            className="mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold bg-orange-500 text-white rounded-xl hover:bg-orange-600 active:scale-[0.98] transition-all shadow-sm shadow-orange-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {t('extensionUpdate.download')}
          </a>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            {isFirefox ? t('extensionUpdate.firefoxReady') : t('extensionUpdate.firefoxNote')}
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {t('extensionUpdate.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
