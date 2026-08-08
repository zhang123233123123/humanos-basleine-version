'use client'

import { FeaturedTestimonials } from '@/components/featured-testimonials'
import { HorizontalGradient } from '@/components/horizontal-gradient'
import { cn } from '@/lib/utils'
import { LanguageSwitch } from '@/components/language-switch'
import { useTranslation } from '@/i18n/LanguageProvider'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitch />
      </div>
      <div className="w-full min-h-screen grid grid-cols-1 md:grid-cols-2">
        {children}
        <div className="relative w-full z-20 hidden md:flex border-l border-neutral-100 dark:border-neutral-800 overflow-hidden bg-gray-50 dark:bg-neutral-900 items-center justify-center">
          <div className="max-w-sm mx-auto">
            <FeaturedTestimonials />
            <p className={cn('font-semibold text-xl text-center')}>
              {t('hero.title')}
            </p>
            <p
              className={cn(
                'font-normal text-base text-center text-muted-foreground mt-8',
              )}
            >
              {t('hero.subtitle')}
            </p>
          </div>
          <HorizontalGradient className="top-20" />
          <HorizontalGradient className="bottom-20" />
          <HorizontalGradient className="-right-80 transform rotate-90 inset-y-0 h-full scale-x-150" />
          <HorizontalGradient className="-left-80 transform rotate-90 inset-y-0 h-full scale-x-150" />
        </div>
      </div>
    </>
  )
}
