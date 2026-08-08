'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import en from './en'
import zh from './zh'

type Locale = 'en' | 'zh'
type Translations = typeof en

type LanguageContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const translations: Record<Locale, Translations> = { en, zh }

const LanguageContext = createContext<LanguageContextType>({
  locale: 'zh',
  setLocale: () => {},
  t: (key: string) => key,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh')

  useEffect(() => {
    const stored = localStorage.getItem('locale') as Locale
    if (stored && (stored === 'en' || stored === 'zh')) {
      setLocaleState(stored)
    }
  }, [])

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem('locale', newLocale)
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`
  }

  function t(key: string): string {
    const keys = key.split('.')
    let result: any = translations[locale]
    for (const k of keys) {
      result = result?.[k]
    }
    return result ?? key
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}
