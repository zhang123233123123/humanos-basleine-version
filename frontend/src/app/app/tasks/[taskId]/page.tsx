'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, CalendarClock, CirclePause, History, Loader2, Play, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageProvider'
import { apiRequest } from '@/lib/client/api'
import type { HumanOSTask } from '@/lib/contracts/task-contracts'
import type { ExecutionSession, InterruptionEpisode } from '@/lib/contracts/execution-contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PlanBlock {
  block_id?: string
  title?: string
  start?: string | number
  end?: string | number
  start_at?: string
  end_at?: string
  planned_start_at?: string
  planned_end_at?: string
  planned_work_minutes?: number
  session_minutes?: number
  plan_revision?: number
}

interface TaskDetailData {
  task: HumanOSTask
  current_sessions: ExecutionSession[]
  history_sessions: ExecutionSession[]
  interruption_episodes: InterruptionEpisode[]
  plan_blocks: PlanBlock[]
  plan?: { plan_id?: string; plan_revision?: number; week_id?: string; plan_status?: string } | null
}

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>()
  const taskId = String(params?.taskId || '')
  const { locale } = useTranslation()
  const c = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale])
  const [detail, setDetail] = useState<TaskDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true); setError('')
    try {
      const result = await apiRequest<{ data: TaskDetailData }>(`/api/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' })
      setDetail(result.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : c('无法加载任务详情', 'Unable to load task details'))
    } finally { setLoading(false) }
  }, [taskId, c])

  useEffect(() => { void load() }, [load])

  if (loading) return <PageState icon={<Loader2 className="h-7 w-7 animate-spin" />} text={c('正在组装任务生命周期…', 'Loading task lifecycle…')} />
  if (error || !detail?.task) return <PageState icon={<AlertCircle className="h-7 w-7 text-destructive" />} text={error || c('任务不存在', 'Task not found')} action={<Button variant="outline" onClick={() => void load()}>{c('重试', 'Retry')}</Button>} />

  return <TaskLifecycle detail={detail} locale={locale} />
}

function TaskLifecycle({ detail, locale }: { detail: TaskDetailData; locale: string }) {
  const c = (zh: string, en: string) => locale === 'zh' ? zh : en
  const { task, current_sessions: current, history_sessions: history, interruption_episodes: episodes, plan_blocks: blocks, plan } = detail
  const total = Number(task.execution?.original_estimate_minutes ?? task.duration ?? task.estimated_duration ?? 0)
  const remaining = Number(task.execution?.remaining_duration_minutes ?? task.duration ?? 0)
  const checkpoints = useMemo(() => {
    const raw = task.checkpoints ?? task.contextWindow ?? task.context_window
    if (Array.isArray(raw)) return raw
    if (raw && typeof raw === 'object') return Object.entries(raw).map(([label, value]) => ({ label, value }))
    return []
  }, [task])

  return <main className="h-full overflow-y-auto bg-muted/20"><div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><Button asChild variant="ghost" size="sm" className="-ml-3 mb-3"><Link href="/app/tasks"><ArrowLeft className="mr-2 h-4 w-4" />{c('返回任务', 'Back to Tasks')}</Link></Button><p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Task lifecycle</p><h1 className="mt-2 break-words text-3xl font-semibold tracking-tight md:text-4xl">{task.title || task.id}</h1><div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge>{String(task.status || 'queued')}</Badge><Badge>{String(task.priority || 'medium')}</Badge>{task.task_type || task.type ? <Badge>{String(task.task_type || task.type)}</Badge> : null}<Badge>ID: {String(task.id)}</Badge></div></div><div className="flex gap-2"><Button asChild variant="outline"><Link href="/app"><CalendarClock className="mr-2 h-4 w-4" />{c('工作台', 'Workspace')}</Link></Button>{current.length > 0 && <Button asChild><Link href="/app/focus"><Play className="mr-2 h-4 w-4" />{c('进入专注', 'Open Focus')}</Link></Button>}</div></div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label={c('总估时', 'Estimated')} value={`${total} min`} /><Metric label={c('剩余', 'Remaining')} value={`${remaining} min`} /><Metric label={c('执行 Session', 'Sessions')} value={String(current.length + history.length)} /><Metric label={c('中断记录', 'Interruptions')} value={String(episodes.length)} /></div>

    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="space-y-6">
      <Section title={c('当前执行', 'Current execution')} icon={<Play className="h-4 w-4" />} empty={c('当前没有 ready、running 或 paused Session。', 'No ready, running, or paused Session.')} hasItems={current.length > 0}>{current.map((session) => <SessionRow key={session.execution_session_id} session={session} locale={locale} />)}</Section>
      <Section title={c('执行历史', 'Execution history')} icon={<History className="h-4 w-4" />} empty={c('还没有历史 Session。', 'No historical Sessions yet.')} hasItems={history.length > 0}>{history.map((session) => <SessionRow key={session.execution_session_id} session={session} locale={locale} />)}</Section>
      <Section title={c('中断与恢复', 'Interruptions and recovery')} icon={<RotateCcw className="h-4 w-4" />} empty={c('这个任务没有中断记录。', 'No interruption episodes for this task.')} hasItems={episodes.length > 0}>{episodes.map((episode) => <EpisodeRow key={episode.id} episode={episode} locale={locale} />)}</Section>
    </div><div className="space-y-6">
      <Card><CardHeader><CardTitle className="text-base">{c('任务本体', 'Task definition')}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><Field label={c('截止时间', 'Deadline')} value={String(task.deadline_at || task.deadline || task.due || '—')} /><Field label={c('下一步', 'Next step')} value={String(task.next_step || '—')} /><Field label={c('当前进度', 'Progress')} value={String(task.progress || `${Math.max(0, Math.round(total ? (1 - remaining / total) * 100 : 0))}%`)} /><Field label={c('上下文', 'Context')} value={String(task.context || '—')} /><Field label={c('资源标签', 'Resource tags')} value={(task.resource_modality || []).join(' / ') || '—'} /></CardContent></Card>
      <Section title={c('正式计划块', 'Published plan blocks')} icon={<CalendarClock className="h-4 w-4" />} empty={c('当前正式计划中没有这个任务的时间块。', 'No block for this task in the active plan.')} hasItems={blocks.length > 0}>{plan && <p className="px-4 pb-2 text-xs text-muted-foreground">{c('计划版本', 'Plan revision')} R{plan.plan_revision ?? '—'} · {plan.plan_status || '—'}</p>}{blocks.map((block, index) => <div key={block.block_id || index} className="border-t px-4 py-3 text-sm"><p className="font-medium">{formatRange(block.planned_start_at || block.start_at || block.start, block.planned_end_at || block.end_at || block.end, locale)}</p><p className="mt-1 text-xs text-muted-foreground">{block.planned_work_minutes || block.session_minutes || 0} min · {block.block_id || c('时间块', 'block')}</p></div>)}</Section>
      <Section title={c('重入检查点', 'Re-entry checkpoints')} icon={<CirclePause className="h-4 w-4" />} empty={c('还没有为这个任务保存检查点。', 'No saved checkpoints for this task.')} hasItems={checkpoints.length > 0}>{checkpoints.map((item, index) => <pre key={index} className="overflow-x-auto border-t px-4 py-3 text-xs whitespace-pre-wrap">{typeof item === 'string' ? item : JSON.stringify(item, null, 2)}</pre>)}</Section>
    </div></div>
  </div></main>
}

function SessionRow({ session, locale }: { session: ExecutionSession; locale: string }) {
  return <div className="border-t px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{formatRange(session.planned_start_at, session.planned_end_at, locale)}</p><p className="mt-1 break-all text-xs text-muted-foreground">{session.execution_session_id}</p></div><Badge>{session.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{session.planned_work_minutes || 0} min{session.pause_reason ? ` · ${session.pause_reason}` : ''}</p></div>
}

function EpisodeRow({ episode, locale }: { episode: InterruptionEpisode; locale: string }) {
  const zh = locale === 'zh'
  return <div className="border-t px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{episode.pause_reason || (zh ? '未填写原因' : 'No reason')}</p><p className="mt-1 text-xs text-muted-foreground">{stamp(episode.paused_at, locale)} · {episode.remaining_minutes ?? 0} min {zh ? '剩余' : 'remaining'}</p></div><Badge>{episode.status}</Badge></div>{episode.resumed_at && <p className="mt-2 text-xs text-muted-foreground">{zh ? '恢复' : 'Resumed'}: {stamp(episode.resumed_at, locale)} · {episode.resume_latency_minutes ?? '—'} min</p>}</div>
}

function Section({ title, icon, empty, hasItems, children }: { title: string; icon: ReactNode; empty: string; hasItems: boolean; children: ReactNode }) { return <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle></CardHeader><CardContent className="p-0">{hasItems ? children : <p className="px-4 pb-5 text-sm text-muted-foreground">{empty}</p>}</CardContent></Card> }
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card> }
function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap break-words">{value}</p></div> }
function Badge({ children }: { children: ReactNode }) { return <span className="rounded-full border bg-muted px-2 py-1 text-[11px] font-medium">{children}</span> }
function formatRange(start: unknown, end: unknown, locale: string) {
  if (start === undefined || start === null || start === '') return locale === 'zh' ? '未设置时间' : 'Time not set'
  if (typeof start === 'number') return `${clockHour(start)}${typeof end === 'number' ? ` → ${clockHour(end)}` : ''}`
  return `${stamp(start, locale)}${end ? ` → ${stamp(end, locale)}` : ''}`
}
function clockHour(value: number) { const hours = Math.floor(value); const minutes = Math.round((value - hours) * 60); return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` }
function stamp(value: unknown, locale: string) { if (!value) return '—'; const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value as string | number); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) }
function PageState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) { return <main className="grid h-full place-items-center bg-muted/20 p-6"><div className="space-y-3 text-center text-sm text-muted-foreground"><div className="flex justify-center">{icon}</div><p>{text}</p>{action}<div><Button asChild variant="ghost" size="sm"><Link href="/app/tasks">Tasks</Link></Button></div></div></main> }
