import type { Metadata } from 'next'
import './globals.css'
import { AI } from '@/app/actions'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { getServerSession } from 'next-auth'
import authOptions from '@/app/api/auth/[...nextauth]/authOptions'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { fontSora } from '@/fonts/font-sora'
import Provider from '@/context/client-provider'

export const metadata: Metadata = {
  title: 'HumanOS - AI Time Manager',
  description: 'AI-powered scheduling that understands your energy rhythms',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="zh" suppressHydrationWarning>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      />

      <body className={fontSora.className}>
        <Provider session={session}>
          <TooltipProvider>
            <AI>{children}</AI>
          </TooltipProvider>
        </Provider>
      </body>
    </html>
  )
}
