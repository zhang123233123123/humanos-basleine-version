import { cookies } from 'next/headers'

type Translation = Record<string, any>

export async function getServerTranslation(): Promise<{ t: (key: string) => string }> {
  const cookieStore = cookies()
  const locale = cookieStore.get('locale')?.value || 'zh'
  const translations: Record<string, Translation> = {
    en: (await import('./en')).default,
    zh: (await import('./zh')).default,
  }
  const messages = translations[locale] || translations.zh

  function t(key: string): string {
    const keys = key.split('.')
    let result: any = messages
    for (const k of keys) {
      result = result?.[k]
    }
    return result ?? key
  }

  return { t }
}
