'use client'

import { useTranslation } from '@/i18n/LanguageProvider'
import { Button } from '@/components/ui/button'

export function LanguageSwitch() {
  const { locale, setLocale } = useTranslation()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
      className="text-xs font-medium"
    >
      {locale === 'en' ? '中文' : 'EN'}
    </Button>
  )
}
