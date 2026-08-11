import { ThemeProvider } from '@/components/theme-provider'
import { AppNavigation } from '@/components/app-navigation'
import { FocusReadyGate } from '@/components/focus-ready-gate'
import { Toaster } from '@/components/ui/sonner'
import { ReactNode } from 'react'
import { ModalProvider } from '@/hooks/use-modal'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ModalProvider>
        <Toaster />
        <div className="relative h-dvh w-full flex flex-col overflow-hidden">
          <AppNavigation />
          <FocusReadyGate />
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </ModalProvider>
    </ThemeProvider>
  )
}
