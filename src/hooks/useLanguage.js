import { useState, useEffect, useCallback } from 'react'
import { en } from '../translations/en'
import { fr } from '../translations/fr'

const LANGUAGE_KEY = 'jobtrackr_language'

const translations = { en, fr }

export function useLanguage() {
  const [language, setLanguageState] = useState(() => {
    // 1. Check localStorage for saved preference
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (saved && translations[saved]) return saved

    // 2. Auto-detect from browser
    const browserLang = navigator.language.split('-')[0] // 'en-US' → 'en'
    if (translations[browserLang]) return browserLang

    // 3. Default to English
    return 'en'
  })

  // Persist language choice
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
  }, [language])

  // Translation function
  const t = useCallback((key) => {
    const keys = key.split('.')
    let value = translations[language]

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k]
      } else {
        return key // Fallback to key if not found
      }
    }

    return value || key
  }, [language])

  const setLanguage = (lang) => {
    if (translations[lang]) {
      setLanguageState(lang)
    }
  }

  return { t, language, setLanguage, availableLanguages: Object.keys(translations) }
}
