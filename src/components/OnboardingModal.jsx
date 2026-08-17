// First-time user onboarding modal.
// Shown once after a brand-new user logs in (no Claude API key configured yet).
// Explains that JobTrackerAI is powered by Claude, enumerates the AI features,
// and invites the user to add their API key in Settings → API Claude.
// It intentionally appears BEFORE any Gmail scan so a new user isn't dropped
// straight into the import flow.
import { useDragDock } from '../hooks/useDragDock'

export default function OnboardingModal({ onAddKey, onSkip, t = (k) => k }) {
  const { startDrag, panelStyle, snapPreview } = useDragDock({ width: 512 })
  const features = [
    { title: t('onboarding.featureGmailTitle'), desc: t('onboarding.featureGmailDesc') },
    { title: t('onboarding.featureCVTitle'), desc: t('onboarding.featureCVDesc') },
    { title: t('onboarding.featureScoreTitle'), desc: t('onboarding.featureScoreDesc') },
    { title: t('onboarding.featureCoachTitle'), desc: t('onboarding.featureCoachDesc') },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onSkip} />
      {snapPreview}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden max-h-[90vh] flex flex-col" style={panelStyle}>
        {/* Header */}
        <div onPointerDown={startDrag} className="px-6 pt-6 pb-4 bg-gradient-to-br from-indigo-500 to-violet-600 text-white cursor-move select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">✨</div>
            <div>
              <h2 className="font-bold text-lg leading-tight">{t('onboarding.welcome')}</h2>
            </div>
          </div>
          <p className="text-sm text-indigo-50 mt-3 leading-relaxed">{t('onboarding.intro')}</p>
        </div>

        {/* Features */}
        <div className="px-6 py-5 overflow-y-auto">
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
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              onClick={onSkip}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors order-2 sm:order-1"
            >
              {t('onboarding.later')}
            </button>
            <button
              onClick={onAddKey}
              className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200 order-1 sm:order-2"
            >
              {t('onboarding.addKey')}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center sm:text-right mt-2">{t('onboarding.skipNote')}</p>
        </div>
      </div>
    </div>
  )
}
