'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircleQuestion, Sparkles, X } from 'lucide-react'
import { useRef } from 'react'
import Image from 'next/image'
import { Chat } from '@/components/chat'
import { Button } from '@/components/ui/button'
import { useChat } from '@/hooks/use-chat'
import { useTranslation } from '@/i18n/LanguageProvider'

export function GlobalAssistant() {
  const { chatOpen, setChatOpen } = useChat()
  const { locale } = useTranslation()
  const open = Boolean(chatOpen)
  const dragging = useRef(false)

  return (
    <>
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.08}
        whileHover={{ scale: 1.03, y: -2 }}
        whileDrag={{ scale: 1.08, y: -4, cursor: 'grabbing' }}
        onPointerDown={() => { dragging.current = false }}
        onDragStart={() => { dragging.current = true }}
        onDragEnd={() => { window.setTimeout(() => { dragging.current = false }, 0) }}
        className="fixed bottom-5 right-5 z-40 touch-none cursor-grab"
      >
        <Button
          type="button"
          onClick={() => { if (!dragging.current) setChatOpen('Hello!') }}
          className="group relative h-16 w-16 overflow-visible rounded-[22px] border border-[#d8c7a5] bg-[#f7f1e5] p-1 shadow-[0_12px_32px_rgba(24,63,47,0.22)] hover:border-[#b99a60] hover:bg-[#fffaf0] dark:border-[#436454] dark:bg-[#15271f] dark:hover:bg-[#1b3328]"
          aria-label={locale === 'zh' ? '打开日程顾问，可拖动位置' : 'Open draggable Calendar Advisor'}
        >
          <span className="pointer-events-none absolute inset-1 rounded-[18px] bg-[radial-gradient(circle_at_35%_20%,rgba(255,255,255,0.95),rgba(238,227,205,0.55)_52%,rgba(25,67,49,0.08))] dark:bg-[radial-gradient(circle_at_35%_20%,rgba(255,255,255,0.12),rgba(26,55,42,0.3)_58%,rgba(0,0,0,0.18))]" />
          <Image src="/assets/calendar-advisor.png" alt="" width={56} height={56} priority className="pointer-events-none relative z-10 h-14 w-14 object-contain drop-shadow-[0_4px_5px_rgba(20,48,37,0.24)]" />
          <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-full border border-[#d8c7a5] bg-[#fffaf0]/95 px-3 py-1.5 text-xs font-semibold text-[#183f2f] opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100 dark:border-[#436454] dark:bg-[#15271f]/95 dark:text-[#f5efe2]">
            {locale === 'zh' ? '日程顾问 · 可拖动' : 'Calendar Advisor · Drag me'}
          </span>
        </Button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/25 p-3 backdrop-blur-[2px] sm:p-6"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setChatOpen('')
            }}
          >
            <motion.section
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="ml-auto flex h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl sm:h-[min(680px,calc(100dvh-3rem))]"
            >
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4" />{locale === 'zh' ? '全局只读助手' : 'Global read-only assistant'}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setChatOpen('')} aria-label={locale === 'zh' ? '关闭' : 'Close'}><X className="h-4 w-4" /></Button>
              </div>
              <div className="min-h-0 flex-1"><Chat chatOpen={chatOpen} closeChat={() => setChatOpen('')} /></div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
