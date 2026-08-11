'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, Loader2, MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/LanguageProvider'

type Message = { role: 'user' | 'assistant'; text: string }

export function Chat({ closeChat, chatOpen }: { closeChat: () => void; chatOpen: string }) {
  const { locale } = useTranslation()
  const [input, setInput] = useState(chatOpen === 'Hello!' ? '' : chatOpen.trim())
  const [messages, setMessages] = useState<Message[]>([])
  const [handoffText, setHandoffText] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const zh = locale === 'zh'
  const quickActions = useMemo(() => zh ? ['总结今天', '查看下一项任务', '今天有哪些风险', '为什么这样安排'] : ['Summarize today', 'What is next?', 'What is at risk?', 'Why this schedule?'], [zh])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, handoffText])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeChat() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeChat])

  async function send(value = input) {
    const text = value.trim()
    if (!text || loading) return
    setInput('')
    setHandoffText('')
    setMessages((current) => [...current, { role: 'user', text }])
    setLoading(true)
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, assistant_mode: 'calendar_advisor', locale }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || body.error || 'Advisor unavailable')
      let job = body.job
      for (let attempt = 0; job && job.status !== 'completed' && job.status !== 'failed' && attempt < 180; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const statusResponse = await fetch(`/api/background-jobs?job_id=${encodeURIComponent(job.job_id)}`)
        const statusBody = await statusResponse.json().catch(() => ({}))
        if (!statusResponse.ok) throw new Error(statusBody.message || statusBody.error || 'Advisor unavailable')
        job = statusBody.job
      }
      if (job?.status === 'failed') throw new Error(job.error || 'Advisor unavailable')
      const turn = job?.result || {}
      setMessages((current) => [...current, { role: 'assistant', text: turn.reply || (zh ? '暂时没有可用摘要。' : 'No summary is available.') }])
      if (turn.handoff_required) setHandoffText(turn.handoff_text || text)
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'Advisor unavailable' }])
    } finally { setLoading(false) }
  }

  function handoff() {
    window.dispatchEvent(new CustomEvent('humanos:planner-handoff', { detail: { text: handoffText } }))
    closeChat()
  }

  return <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl bg-background">
    <header className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-700 text-white"><MessageCircleQuestion className="h-4 w-4" /></span><div><p className="text-sm font-semibold">{zh ? '日程顾问' : 'Calendar Advisor'}</p><p className="text-[11px] text-muted-foreground">{zh ? '只读查询、总结与解释' : 'Read-only queries, summaries and explanations'}</p></div></div><Button size="icon" variant="ghost" onClick={closeChat}><ArrowLeft className="h-4 w-4" /></Button></header>
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><p className="text-sm font-medium">{zh ? '你想了解哪部分日程？' : 'What would you like to know?'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{zh ? '我可以查询、总结和解释，但不会直接修改任务或计划。' : 'I can query, summarize and explain, but I never modify tasks or plans.'}</p><div className="mt-3 flex flex-wrap gap-2">{quickActions.map((action) => <button key={action} onClick={() => void send(action)} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:border-emerald-500">{action}</button>)}</div></div>}
      {messages.map((message, index) => <div key={index} className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-emerald-700 text-white' : 'border bg-muted/40'}`}>{message.text}</div>)}
      {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{zh ? '正在读取日程...' : 'Reading your schedule...'}</div>}
      {handoffText && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-semibold text-blue-950">{zh ? '需要修改计划' : 'Planning change required'}</p><p className="mt-1 text-xs text-blue-800">{zh ? '任务规划助手会生成可确认的预览，不会直接写入。' : 'Task Planner will create a reviewable preview before anything is saved.'}</p><Button className="mt-3 w-full" size="sm" onClick={handoff}>{zh ? '转交任务规划助手' : 'Open Task Planner'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>}
    </div>
    <form className="border-t p-3" onSubmit={(event) => { event.preventDefault(); void send() }}><div className="flex items-end gap-2 rounded-2xl border bg-muted/25 p-2"><textarea rows={2} className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={zh ? '查询或总结日程...' : 'Ask about your schedule...'} /><Button type="submit" size="icon" disabled={loading || !input.trim()}><ArrowUp className="h-4 w-4" /></Button></div></form>
  </div>
}
