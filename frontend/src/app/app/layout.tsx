import { ThemeProvider } from '@/components/theme-provider'
import { FloatingDock } from '@/components/ui/floating-dock'
import { Toaster } from '@/components/ui/sonner'
import { ReactNode } from 'react'
import { ModalProvider } from '@/hooks/use-modal'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ModalProvider>
        <Toaster />
        <div className="relative h-dvh w-full flex flex-col overflow-hidden">
          {children}
          <FloatingDock />
        </div>
      </ModalProvider>
    </ThemeProvider>
  )
}
