// First-time user onboarding — a small wizard shown once after a brand-new user
// logs in (no Claude API key configured yet).
//
// Page 1 explains that SmartJobTracker is powered by Claude and lists the AI
// features. Page 2 pitches the browser extension — a core way to capture jobs
// while browsing — and invites the user to download it. The extension page is
// skipped when the extension is already installed. It intentionally appears
// BEFORE any Gmail scan so a new user isn't dropped straight into the import.
import { useState } from 'react'
import { useDragDock } from '../hooks/useDragDock'
import { EXTENSION_XPI_PATH as XPI_HREF } from '../constants/extension'

export default function OnboardingModal({ onAddKey, onSkip, extensionInstalled, t = (k) => k }) {
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 512 })

  // Include the extension page unless we've confirmed it's already installed.
  const showExt = extensionInstalled !== true
  const pages = showExt ? ['ai', 'ext'] : ['ai']
  const [step, setStep] = useState(0)
  const page = pages[step]
  const isLast = step === pages.length - 1

  const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)

  const features = [
    { title: t('onboarding.featureGmailTitle'), desc: t('onboarding.featureGmailDesc') },
    { title: t('onboarding.featureCVTitle'), desc: t('onboarding.featureCVDesc') },
    { title: t('onboarding.featureScoreTitle'), desc: t('onboarding.featureScoreDesc') },
    { title: t('onboarding.featureCoachTitle'), desc: t('onboarding.featureCoachDesc') },
  ]

  const extFeatures = [
    { title: t('onboarding.extFeat1Title'), desc: t('onboarding.extFeat1Desc') },
    { title: t('onboarding.extFeat2Title'), desc: t('onboarding.extFeat2Desc') },
    { title: t('onboarding.extFeat3Title'), desc: t('onboarding.extFeat3Desc') },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onSkip} />
      {snapPreview}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden max-h-[90vh] flex flex-col" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="px-6 pt-6 pb-4 bg-gradient-to-br from-indigo-500 to-violet-600 text-white cursor-move select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">
              {page === 'ext' ? '🧩' : '✨'}
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">
                {page === 'ext' ? t('onboarding.extTitle') : t('onboarding.welcome')}
              </h2>
            </div>
          </div>
          <p className="text-sm text-indigo-50 mt-3 leading-relaxed">
            {page === 'ext' ? t('onboarding.extIntro') : t('onboarding.intro')}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {page === 'ai' ? (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('onboarding.featuresTitle')}</p>
              <div className="space-y-3">
                {features.map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <span className="text-lg shrink-0">🔑</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">{t('onboarding.keyNeeded')}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{t('onboarding.getKeyHint')}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('onboarding.extWhat')}</p>
              <div className="space-y-3">
                {extFeatures.map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Download CTA */}
              <a
                href={XPI_HREF}
                className="mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold bg-orange-500 text-white rounded-xl hover:bg-orange-600 active:scale-[0.98] transition-all shadow-sm shadow-orange-200"
              >
                <span className="text-base">🦊</span>
                {t('onboarding.extDownload')}
              </a>
              <p className="text-[11px] text-gray-400 text-center mt-2">
                {isFirefox ? t('onboarding.extFirefoxReady') : t('onboarding.extFirefoxNote')}
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100">
          {/* Progress dots (multi-page only) */}
          {pages.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {pages.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-indigo-600' : 'w-1.5 bg-gray-200'}`} />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {step > 0 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                {t('onboarding.back')}
              </button>
            ) : (
              <button
                onClick={onSkip}
                className="px-3 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                {t('onboarding.later')}
              </button>
            )}

            {!isLast ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200"
              >
                {t('onboarding.next')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Multi-page: the left button is "Back", so offer a dismiss here too. */}
                {step > 0 && (
                  <button
                    onClick={onSkip}
                    className="px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    {t('onboarding.getStarted')}
                  </button>
                )}
                <button
                  onClick={onAddKey}
                  className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200"
                >
                  {t('onboarding.addKey')}
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400 text-center sm:text-right mt-2">{t('onboarding.skipNote')}</p>
        </div>
      </div>
    </div>
  )
}
