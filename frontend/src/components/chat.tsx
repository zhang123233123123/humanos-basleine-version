'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowUp, CalendarPlus, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEvents } from '@/hooks/use-events'
import { useModal } from '@/hooks/use-modal'

type Message = { role: 'user' | 'assistant'; text: string }

function readDate(task: any, keys: string[]): Date | null {
  for (const key of keys) {
    if (!task[key]) continue
    const value = new Date(task[key])
    if (!Number.isNaN(value.getTime())) return value
  }
  return null
}

export function Chat({ closeChat, chatOpen }: { closeChat: () => void; chatOpen: string }) {
  const router = useRouter()
  const [input, setInput] = useState(chatOpen === 'Hello!' ? '' : chatOpen.trim())
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingTasks, setPendingTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { setPreviewTasks, setActiveEvent } = useModal()
  const { setEvents } = useEvents()

  const quickActions = useMemo(() => [
    '帮我安排今天的任务',
    '查看我今天的日程',
    '记录当前任务进度',
    '解释接下来的安排',
  ], [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingTasks])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeChat() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeChat])

  async function send(value = input) {
    const text = value.trim()
    if (!text || loading) return
    setInput('')
    setMessages((current) => [...current, { role: 'user', text }])
    setLoading(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || body.error || 'Assistant unavailable')
      setMessages((current) => [...current, { role: 'assistant', text: body.turn?.reply || '已完成分析。' }])
      setPendingTasks(Array.isArray(body.turn?.tasks) ? body.turn.tasks : [])
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'Assistant unavailable' }])
    } finally {
      setLoading(false)
    }
  }

  function reviewTasks() {
    const now = new Date()
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9)
    const previews = pendingTasks.map((task, index) => {
      const start = readDate(task, ['start_time', 'start_at', 'start']) || defaultStart
      const end = readDate(task, ['end_time', 'deadline_at', 'end']) || new Date(start.getTime() + 3600000)
      return {
        id: task.id || 'assistant-task',
        uniqueId: `preview-assistant-${task.id || `${Date.now()}-${index}`}`,
        title: task.title || `Task ${index + 1}`,
        start,
        end,
        allDay: Boolean(task.all_day),
        timeText: task.due || task.deadline || '',
        description: task.context || '',
        attendees: task.attendees || [],
        status: task.status || 'pending',
        priority: task.priority || 'medium',
        isPreview: true,
        context: task.context || '',
        progress: task.progress || '',
        nextStep: task.next_step || '',
        openQuestions: task.open_questions || '',
      }
    })
    const ids = new Set(previews.map((task) => task.uniqueId))
    setEvents([
      ...useEvents.getState().events.filter((event) => !ids.has(String(event.id))),
      ...previews.map((task) => ({
        id: task.uniqueId, title: task.title, start: task.start, end: task.end, allDay: task.allDay,
        classNames: ['preview-event'],
        extendedProps: { ...task },
      })),
    ])
    setActiveEvent(null)
    setPreviewTasks(previews)
    closeChat()
    router.push('/app')
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></span><div><p className="text-sm font-semibold">HumanOS Assistant</p><p className="text-[11px] text-muted-foreground">理解任务，但由你确认变更</p></div></div>
        <Button size="icon" variant="ghost" onClick={closeChat}><ArrowLeft className="h-4 w-4" /></Button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <div className="rounded-2xl border bg-muted/35 p-4"><p className="text-sm font-medium">你现在想处理什么？</p><p className="mt-1 text-xs leading-5 text-muted-foreground">可以创建任务、调整计划、查询日程或记录进度。任何计划变化都会先让你确认。</p><div className="mt-3 flex flex-wrap gap-2">{quickActions.map((action) => <button key={action} onClick={() => void send(action)} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:border-primary/50">{action}</button>)}</div></div>}
        {messages.map((message, index) => <div key={index} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'border bg-muted/40'}`}>{message.text}</div>)}
        {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在理解并检查上下文...</div>}
        {pendingTasks.length > 0 && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3"><p className="text-sm font-semibold">识别到 {pendingTasks.length} 个待确认任务</p><div className="mt-2 space-y-1">{pendingTasks.map((task, index) => <p key={index} className="truncate text-xs text-muted-foreground">{index + 1}. {task.title}</p>)}</div><Button className="mt-3 w-full" size="sm" onClick={reviewTasks}><CalendarPlus className="mr-2 h-4 w-4" />前往工作台确认</Button></div>}
      </div>

      <form className="border-t p-3" onSubmit={(event) => { event.preventDefault(); void send() }}><div className="flex items-end gap-2 rounded-2xl border bg-muted/25 p-2"><textarea rows={2} className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="创建任务、调整计划或查询日程..." /><Button type="submit" size="icon" disabled={loading || !input.trim()}><ArrowUp className="h-4 w-4" /></Button></div></form>
    </div>
  )
}
