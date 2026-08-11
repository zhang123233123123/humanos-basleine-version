'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircleQuestion, Sparkles, X } from 'lucide-react'
import { useRef } from 'react'
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
        whileDrag={{ scale: 1.04, cursor: 'grabbing' }}
        onPointerDown={() => { dragging.current = false }}
        onDragStart={() => { dragging.current = true }}
        onDragEnd={() => { window.setTimeout(() => { dragging.current = false }, 0) }}
        className="fixed bottom-5 right-5 z-40 touch-none cursor-grab"
      >
        <Button
          type="button"
          onClick={() => { if (!dragging.current) setChatOpen('Hello!') }}
          className="h-12 rounded-full px-4 shadow-lg shadow-primary/20"
          aria-label={locale === 'zh' ? '打开日程顾问，可拖动位置' : 'Open draggable Calendar Advisor'}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          <span>{locale === 'zh' ? '日程顾问' : 'Calendar Advisor'}</span>
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
