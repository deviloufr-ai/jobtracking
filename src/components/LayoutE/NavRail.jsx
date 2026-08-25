// NavRail — left navigation rail for the new "E — Focus + List" layout.
//
// Desktop/tablet only (md+). It relocates the top header's tab nav + primary
// actions (Add / Refresh / account) into a fixed left sidebar. Rendered behind
// the FLAGS.LAYOUT_E flag; the current top-header layout stays intact when off.
// Styling uses the same light utility classes the rest of the app uses, so the
// existing body.is-dark theme overrides apply here too.
import { useState } from 'react'

const XPI_HREF = '/jobtracker-addon-1.6.0.xpi'

// Browser-extension affordance for the rail footer.
//   installed === true  → green "installed" row
//   installed === false → orange "Install extension" row + ⓘ what-and-why popover
//   installed === null  → nothing (still detecting)
function RailExtension({ installed, t }) {
  const [info, setInfo] = useState(false)
  const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)

  if (installed === null) return null

  if (installed === true) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-green-700 bg-green-50">
        <span className="text-base leading-none w-5 text-center">🦊</span>
        <span className="flex-1">{t('extension.installed')}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
    )
  }

  const bullets = [
    { title: t('onboarding.extFeat1Title'), desc: t('onboarding.extFeat1Desc') },
    { title: t('onboarding.extFeat2Title'), desc: t('onboarding.extFeat2Desc') },
    { title: t('onboarding.extFeat3Title'), desc: t('onboarding.extFeat3Desc') },
  ]

  return (
    <div className="relative flex items-center gap-1">
      <a
        href={XPI_HREF}
        title={t('addMenu.installExt')}
        className="flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors"
      >
        <span className="text-base leading-none w-5 text-center">🦊</span>
        <span className="flex-1 text-left">{t('addMenu.installExt')}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
      </a>
      <button
        onClick={() => setInfo(v => !v)}
        aria-label={t('extension.whatIsIt')}
        title={t('extension.whatIsIt')}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </button>

      {info && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setInfo(false)} />
          <div className="absolute left-full bottom-0 ml-2 z-50 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-orange-500 to-amber-500 text-white">
              <div className="flex items-center gap-2">
                <span className="text-lg">🦊</span>
                <h3 className="font-bold text-sm leading-tight">{t('onboarding.extTitle')}</h3>
              </div>
              <p className="text-[11px] text-orange-50 mt-1.5 leading-relaxed">{t('onboarding.extIntro')}</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {bullets.map((b, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-gray-800">{b.title}</p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{b.desc}</p>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <a
                href={XPI_HREF}
                onClick={() => setInfo(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-orange-500 text-white rounded-xl hover:bg-orange-600 active:scale-95 transition-all"
              >
                <span>🦊</span>{t('onboarding.extDownload')}
              </a>
              <p className="text-[10px] text-gray-400 text-center mt-2">{isFirefox ? t('onboarding.extFirefoxReady') : t('onboarding.extFirefoxNote')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function NavRail({
  items = [],
  activeTab,
  onNav,
  onAdd,
  gmailUser,
  showRefresh,
  refreshing,
  onRefresh,
  onAccount,
  onTour,
  extensionInstalled = null,
  t = (k) => k,
}) {
  return (
    <aside className="hidden md:flex fixed top-0 left-0 bottom-0 z-30 w-[220px] flex-col bg-white border-r border-gray-100 shadow-[1px_0_8px_0_rgba(0,0,0,0.04)]">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 shrink-0 border-b border-gray-100">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 64 64" className="w-5 h-5" fill="none" aria-hidden="true">
            <polyline points="16,33 28,45 50,17" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="17" r="5" fill="#fff" />
          </svg>
        </div>
        <span className="font-bold text-gray-900 text-[15px] tracking-tight">SmartJobTracker</span>
      </div>

      {/* Primary action */}
      <div className="px-3 pt-3">
        <button
          data-tour="add"
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-semibold shadow-sm hover:brightness-105 active:scale-[0.98] transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
          {t('nav.add')}
        </button>
      </div>

      {/* Navigation */}
      <nav data-tour="nav" className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1">
        {items.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onNav(tab.id)}
              data-tour={tab.id === 'settings' ? 'settings' : undefined}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                active ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="text-base leading-none w-5 text-center">{tab.icon}</span>
              <span className="flex-1 text-left">{tab.label}</span>
              {tab.badge > 0 && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer: refresh + account */}
      <div className="px-3 py-3 border-t border-gray-100 flex flex-col gap-1 shrink-0">
        {showRefresh && (
          <button
            data-tour="refresh"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <svg className={`w-5 h-5 text-indigo-500 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {refreshing ? t('header.loading') : t('nav.refresh')}
          </button>
        )}
        <RailExtension installed={extensionInstalled} t={t} />
        {onTour && (
          <button
            onClick={onTour}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {t('tour.replay')}
          </button>
        )}
        <button
          data-tour="gmail"
          onClick={onAccount}
          className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors text-left"
        >
          {gmailUser?.picture
            ? <img src={gmailUser.picture} alt="" className="w-8 h-8 rounded-full" />
            : <div className="w-8 h-8 rounded-full bg-indigo-500 text-white text-sm flex items-center justify-center font-bold">{(gmailUser?.email || gmailUser?.name || 'U')[0]?.toUpperCase()}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{gmailUser?.name || gmailUser?.email || t('nav.tabs.settings')}</div>
            {gmailUser?.email && <div className="text-[11px] text-gray-400 truncate">{gmailUser.email}</div>}
          </div>
        </button>
      </div>
    </aside>
  )
}
