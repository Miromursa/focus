import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Locale } from '../db/types'
import de from './de.json'
import en from './en.json'

export const resources = { en: { translation: en }, de: { translation: de } } as const

export function resolveLocale(pref: Locale | undefined): 'en' | 'de' {
  if (pref === 'en' || pref === 'de') return pref
  const nav = typeof navigator === 'undefined' ? 'en' : navigator.language
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en'
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLocale('auto'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
