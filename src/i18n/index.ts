import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import nl from './locales/nl.json'

export const SUPPORTED_LANGUAGES = ['en', 'nl'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

/** localStorage key that remembers the user's language choice. */
export const LANGUAGE_STORAGE_KEY = 'garden-designer.language'

export function isLanguage(value: string | undefined): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language)
}

/** Current UI language, always one of the supported languages. */
export function currentLanguage(): Language {
  const lng = i18n.resolvedLanguage
  return isLanguage(lng) ? lng : 'en'
}

function syncDocument(): void {
  document.documentElement.lang = currentLanguage()
  document.title = i18n.t('app.name')
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      nl: { translation: nl },
    },
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true, // e.g. nl-NL / nl-BE → nl
    load: 'languageOnly',
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // A saved choice wins; otherwise follow the browser's language.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

i18n.on('languageChanged', syncDocument)
syncDocument()

export default i18n
