'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CalendarClock, CheckCircle2, ListTodo, Loader2, Search } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageProvider'
import type { HumanOSTask } from '@/lib/contracts/task-contracts'
import { apiRequest } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const ACTIVE = new Set(['queued', 'scheduled', 'ready', 'running', 'paused', 'blocked'])

export default function TasksPage() {
  const { locale } = useTranslation()
  const c = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale])
  const [tasks, setTasks] = useState<HumanOSTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'active' | 'all' | 'completed'>('active')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await apiRequest<any>('/api/tasks', { cache: 'no-store' })
      setTasks(result?.data?.tasks || result?.tasks || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : c('无法加载任务', 'Unable to load tasks'))
    } finally { setLoading(false) }
  }, [c])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => tasks.filter((task) => {
    const status = String(task.status || 'queued')
    if (scope === 'active' && !ACTIVE.has(status)) return false
    if (scope === 'completed' && !['completed', 'terminated'].includes(status)) return false
    return !query.trim() || String(task.title || '').toLowerCase().includes(query.trim().toLowerCase())
  }), [tasks, query, scope])

  return <main className="h-full overflow-y-auto bg-muted/20">
    <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Tasks</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{c('任务', 'Tasks')}</h1><p className="mt-2 text-sm text-muted-foreground">{c('查看任务本体、执行 Session、中断与恢复历史。', 'Inspect each task, its execution Sessions, interruptions, and recovery history.')}</p></div><Button asChild><Link href="/app">{c('返回工作台', 'Open Workspace')}</Link></Button></div>
      <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c('搜索任务', 'Search tasks')} /></div><div className="flex gap-2">{(['active','all','completed'] as const).map((value) => <Button key={value} variant={scope === value ? 'default' : 'outline'} onClick={() => setScope(value)}>{value === 'active' ? c('进行中', 'Active') : value === 'completed' ? c('已结束', 'Finished') : c('全部', 'All')}</Button>)}</div></CardContent></Card>
      {loading ? <State icon={<Loader2 className="h-6 w-6 animate-spin" />} text={c('正在加载任务…', 'Loading tasks…')} /> : error ? <State icon={<AlertCircle className="h-6 w-6 text-destructive" />} text={error} action={<Button variant="outline" onClick={() => void load()}>{c('重试', 'Retry')}</Button>} /> : visible.length === 0 ? <State icon={<ListTodo className="h-7 w-7" />} text={c('当前没有符合条件的任务。', 'No tasks match this view.')} /> : <div className="grid gap-4 md:grid-cols-2">{visible.map((task) => <TaskCard key={String(task.id)} task={task} locale={locale} />)}</div>}
    </div>
  </main>
}

function TaskCard({ task, locale }: { task: HumanOSTask; locale: string }) {
  const remaining = Number(task.execution?.remaining_duration_minutes ?? task.duration ?? 0)
  const total = Number(task.execution?.original_estimate_minutes ?? task.duration ?? 0)
  const status = String(task.status || 'queued')
  return <Link href={`/app/tasks/${encodeURIComponent(String(task.id))}`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary"><Card className="h-full transition hover:border-primary/40 hover:shadow-md"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-lg leading-snug">{task.title || task.id}</CardTitle><span className="rounded-full border bg-muted px-2 py-1 text-[11px] font-medium">{status}</span></div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{task.due || task.deadline_at || (locale === 'zh' ? '无截止时间' : 'No deadline')}</span><span>{locale === 'zh' ? `剩余 ${remaining} / ${total} 分钟` : `${remaining} / ${total} min remaining`}</span></div>{task.context && <p className="line-clamp-2 text-sm text-muted-foreground">{task.context}</p>}<div className="flex items-center justify-between border-t pt-3 text-xs"><span>{task.priority || 'medium'}</span><span className="flex items-center gap-1 text-primary">{['completed','terminated'].includes(status) && <CheckCircle2 className="h-3.5 w-3.5" />}{locale === 'zh' ? '查看完整生命周期' : 'View lifecycle'}</span></div></CardContent></Card></Link>
}

function State({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) { return <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-card p-8 text-center"><div className="space-y-3 text-sm text-muted-foreground"><div className="flex justify-center">{icon}</div><p>{text}</p>{action}</div></div> }
