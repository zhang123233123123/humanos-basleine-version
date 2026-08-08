import { ThemeProvider } from '@/components/theme-provider'
import '../globals.css'
import { Footer } from '@/components/footer'
import { LanguageSwitch } from '@/components/language-switch'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main>
      <ThemeProvider attribute="class" forcedTheme="light">
        <div className="fixed top-4 right-4 z-50">
          <LanguageSwitch />
        </div>
        {children}
        <Footer />
      </ThemeProvider>
    </main>
  )
}
