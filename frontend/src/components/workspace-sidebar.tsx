'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/LanguageProvider'
import { signOut } from 'next-auth/react'
import {
  MessageSquare,
  Calendar,
  CheckSquare,
  Settings,
  LogOut,
  Plus,
} from 'lucide-react'

interface WorkspaceSidebarProps {
  focusChatTrigger: number
  onSendMessage: (message: string) => Promise<any>
}

function SidebarContent({ focusChatTrigger, onSendMessage }: WorkspaceSidebarProps) {
  const { t, locale } = useTranslation()
  const [activeNav, setActiveNav] = useState('chat')
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([])

  // State tracking
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (focusChatTrigger > 0) {
      textareaRef.current?.focus()
    }
  }, [focusChatTrigger])

  useEffect(() => {
    const receiveHandoff = (event: Event) => {
      const text = String((event as CustomEvent<{ text?: string }>).detail?.text || '')
      setActiveNav('chat')
      setChatInput(text)
      window.setTimeout(() => textareaRef.current?.focus(), 0)
    }
    window.addEventListener('humanos:planner-handoff', receiveHandoff)
    return () => window.removeEventListener('humanos:planner-handoff', receiveHandoff)
  }, [])

  const [focus, setFocus] = useState(5)
  const [energy, setEnergy] = useState(4)
  const [stress, setStress] = useState(5)

  const navItems = [
    { id: 'chat', icon: MessageSquare, label: t('workspace.aiChat') },
    { id: 'calendar', icon: Calendar, label: t('workspace.calendar') },
    { id: 'tasks', icon: CheckSquare, label: t('workspace.tasks') },
    { id: 'profile', icon: Settings, label: t('workspace.profile') },
  ]

  const handleSend = async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const data = await onSendMessage(msg)
      if (data?.turn?.reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: data.turn.reply }])
      }
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <aside className="w-72 shrink-0 border-r border-border h-full flex flex-col bg-background" suppressHydrationWarning>
      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-3 border-b border-border">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveNav(id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeNav === id
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold">{locale === 'zh' ? '任务规划助手' : 'Task Planner'}</h3>
          <p className="text-xs text-muted-foreground">{locale === 'zh' ? '创建、拆解或调整任务，确认后才写入' : 'Create, break down or adjust tasks; changes require confirmation'}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
          {chatMessages.length === 0 && (
            <p className="text-muted-foreground text-xs text-center pt-4">
              {t('workspace.assistantHint')}
            </p>
          )}
          {chatMessages.map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded-lg text-xs ${
                m.role === 'user'
                  ? 'bg-primary/10 ml-4'
                  : 'bg-muted mr-4'
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex gap-1">
            <textarea
              ref={textareaRef}
              className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              rows={2}
              placeholder={t('workspace.assistantHint')}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => textareaRef.current?.focus()}
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('workspace.addTask')}
            </Button>
            <Button
              size="sm"
              className="text-xs h-7"
              onClick={handleSend}
              disabled={chatLoading || !chatInput.trim()}
            >
              {t('workspace.send')}
            </Button>
          </div>
        </div>
      </div>

      {/* State Panel */}
      <div className="border-t border-border p-3">
        <div className="mb-2">
          <h3 className="text-xs font-semibold">{t('workspace.currentState')}</h3>
          <p className="text-[10px] text-muted-foreground">{t('workspace.stateDesc')}</p>
        </div>
        <div className="space-y-2">
          {[
            { label: t('workspace.focus'), value: focus, setter: setFocus, max: 7 },
            { label: t('workspace.energy'), value: energy, setter: setEnergy, max: 7 },
            { label: t('workspace.stress'), value: stress, setter: setStress, max: 7 },
          ].map(({ label, value, setter, max }) => (
            <label key={label} className="flex items-center gap-2">
              <span className="text-xs w-10 shrink-0 text-muted-foreground">{label}</span>
              <input
                type="range"
                min={1}
                max={max}
                value={value}
                onChange={(e) => setter(Number(e.target.value))}
                className="flex-1 h-1 accent-primary"
              />
              <strong className="text-xs w-4 text-right tabular-nums">{value}</strong>
            </label>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground justify-start h-8 hover:text-foreground"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="w-3 h-3 mr-1" />
          {t('workspace.logout')}
        </Button>
      </div>
    </aside>
  )
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) {
    return <aside className="w-72 shrink-0 border-r border-border h-full bg-background" />
  }
  return <SidebarContent {...props} />
}
