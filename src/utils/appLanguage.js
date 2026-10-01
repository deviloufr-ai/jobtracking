// The app's UI language, readable OUTSIDE React (services, module-level helpers).
//
// Mirrors useLanguage's resolution: the user's explicit choice
// (`jobtrackr_language`, written by useLanguage) wins; otherwise the browser
// language when we ship it; otherwise English. Several components used to look at
// `navigator.language` directly, so switching the app to English on a French
// browser (or the reverse) left those screens in the other language. Call this at
// render/call time — not once at module load — so a language switch applies live.
const LANGUAGE_KEY = 'jobtrackr_language'
const SUPPORTED = ['en', 'fr']

export function getAppLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (SUPPORTED.includes(saved)) return saved
  } catch { /* storage unavailable — fall through */ }
  const browser = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : '').split('-')[0]
  return SUPPORTED.includes(browser) ? browser : 'en'
}

export const isAppEnglish = () => getAppLanguage() === 'en'
