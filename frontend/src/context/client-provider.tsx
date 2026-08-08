'use client'

import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/i18n/LanguageProvider'

export default function Provider({
  children,
  session,
}: {
  children: React.ReactNode
  session: any
}): React.ReactNode {
  return (
    <SessionProvider session={session}>
      <LanguageProvider>{children}</LanguageProvider>
    </SessionProvider>
  )
}
