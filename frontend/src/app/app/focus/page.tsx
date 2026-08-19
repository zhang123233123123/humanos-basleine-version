'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock3, Loader2, Pause, Play, Square, TimerReset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiRequest } from '@/lib/client/api'
import { requestId } from '@/lib/client/request-id'
import type { CurrentExecution, ExecutionFeedbackResult, ExecutionImpact, ExecutionInterruption, ExecutionResourceEnvelope, ExecutionSession, InterruptionAction, LocalCalendarDiff, ReadyQueueItem } from '@/lib/contracts/execution-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

function timestamp(value: unknown): number | null {
  if (!value) return null
  if (typeof value === 'number') return value > 9999999999 ? value : value * 1000
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function durationLabel(totalSeconds: number) {
  const safe = Math.max(Math.floor(totalSeconds), 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export default function FocusPage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [replanning, setReplanning] = useState(false)
  const [current, setCurrent] = useState<CurrentExecution | null>(null)
  const [history, setHistory] = useState<ExecutionSession[]>([])
  const [endedSession, setEndedSession] = useState<ExecutionSession | null>(null)
  const [resumeImpact, setResumeImpact] = useState<ExecutionImpact | null>(null)
  const [pausePrompt, setPausePrompt] = useState(false)
  const [pauseAction, setPauseAction] = useState<InterruptionAction | null>(null)
  const [readyQueue, setReadyQueue] = useState<ReadyQueueItem[]>([])
  const [pauseReason, setPauseReason] = useState('')
  const [pauseProgress, setPauseProgress] = useState('')
  const [pauseNextStep, setPauseNextStep] = useState('')
  const [resumePreference, setResumePreference] = useState<'soon' | 'later_today' | 'unknown'>('soon')
  const [preferredResumeAt, setPreferredResumeAt] = useState('')
  const [now, setNow] = useState(Date.now())
  const [actualMinutes, setActualMinutes] = useState(0)
  const [completion, setCompletion] = useState<'completed' | 'some_progress' | 'no_progress' | 'did_not_start'>('some_progress')
  const [remainingMinutes, setRemainingMinutes] = useState(0)
  const [progress, setProgress] = useState('')
  const [feedbackNextStep, setFeedbackNextStep] = useState('')
  const [remainingWork, setRemainingWork] = useState('')
  const [scheduleAction, setScheduleAction] = useState<'keep_time_free' | 'review_today'>('keep_time_free')
  const [difficulty, setDifficulty] = useState(4)
  const [focusAfter, setFocusAfter] = useState(4)
  const [energyAfter, setEnergyAfter] = useState(4)
  const [stressAfter, setStressAfter] = useState(4)
  const [timingFit, setTimingFit] = useState('good')
  const [sessionLengthFit, setSessionLengthFit] = useState('appropriate')

  const loadExecution = useCallback(async () => {
    setLoading(true)
    try {
      const [currentData, historyData] = await Promise.all([
        apiRequest<ExecutionResourceEnvelope<{ current: CurrentExecution }>>('/api/execution-sessions/current'),
        apiRequest<ExecutionResourceEnvelope<{ execution_sessions: ExecutionSession[] }>>('/api/execution-sessions'),
      ])
      // The browser timer is display-only. Re-anchor it whenever server state is
      // loaded so background-tab throttling cannot make elapsed time appear lost.
      setNow(Date.now())
      setCurrent(currentData.data.current)
      setHistory(historyData.data.execution_sessions || [])
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadExecution()
  }, [loadExecution])

  useEffect(() => {
    const refreshExecution = () => void loadExecution()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        refreshExecution()
      }
    }

    window.addEventListener('humanos:plan-updated', refreshExecution)
    window.addEventListener('humanos:plan-revision', refreshExecution)
    window.addEventListener('focus', refreshExecution)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('humanos:plan-updated', refreshExecution)
      window.removeEventListener('humanos:plan-revision', refreshExecution)
      window.removeEventListener('focus', refreshExecution)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadExecution])

  const breakSession = current?.session?.interruption_action === 'short_break'
    ? current.session
    : current?.deferred_sessions?.find((item) => item.interruption_action === 'short_break') || null
  const breakEndsAt = timestamp(breakSession?.preferred_resume_at)
  const breakRemainingSeconds = breakEndsAt ? Math.max(Math.ceil((breakEndsAt - now) / 1000), 0) : 0
  const breakFinished = Boolean(breakSession && breakRemainingSeconds === 0)

  useEffect(() => {
    if (!['running', 'overdue_running'].includes(String(current?.mode)) && !breakSession) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [breakSession, current?.mode])

  const session = current?.session || null
  const overdueSessions = current?.overdue_sessions || []
  const task = current?.task || session?.task || null
  const title = session?.task_title || session?.title || task?.title || t('execution.untitledTask')
  const activeSegmentStartedAt = timestamp(session?.resumed_at ?? session?.actual_start_at ?? session?.started_at)
  const persistedMinutes = Number(session?.accumulated_active_minutes ?? session?.actual_minutes ?? 0)
  const isActivelyRunning = current?.mode === 'running' || current?.mode === 'overdue_running'
  const activeSegmentSeconds = isActivelyRunning && activeSegmentStartedAt
    ? Math.max(Math.floor((now - activeSegmentStartedAt) / 1000), 0)
    : 0
  const elapsedSeconds = persistedMinutes * 60 + activeSegmentSeconds

  const plannedMinutes = Number(session?.planned_work_minutes || 0)
  const persistedRemaining = session?.session_remaining_minutes == null
    ? Math.max(plannedMinutes - persistedMinutes, 0)
    : Number(session.session_remaining_minutes)
  const displayRemaining = Math.max(persistedRemaining - Math.floor(activeSegmentSeconds / 60), 0)

  const contextWindow = (task?.contextWindow || {}) as Record<string, unknown>
  const nextStep = String(contextWindow.nextStep || contextWindow.next_step || '')

  const startSession = async (skipImpactCheck = false) => {
    if (!session) return
    if (current?.requires_resolution && current.mode !== 'overdue_running') {
      toast(locale === 'zh' ? '请先处理上方的超时执行记录，再开始下一项。' : 'Resolve the overdue execution record above before starting the next session.')
      return
    }
    setSubmitting(true)
    try {
      if (current?.mode === 'paused' && !skipImpactCheck) {
        const analysis = await apiRequest<ExecutionResourceEnvelope<{ impact: ExecutionImpact }>>('/api/execution-sessions/impact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ execution_session_id: session.execution_session_id, remaining_minutes: displayRemaining, action: 'resume' }),
        })
        if (analysis.data.impact.requires_plan_adjustment) {
          setResumeImpact(analysis.data.impact)
          return
        }
      }
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession }>>('/api/execution-sessions/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, request_id: requestId('start') }),
      })
      setCurrent({ mode: 'running', session: result.data.execution_session, task })
      setResumeImpact(null)
      setNow(Date.now())
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: current?.mode === 'paused' ? 'resume' : 'start', executionSession: result.data.execution_session } }))
      toast(t('execution.started'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.startFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const pauseSession = async (action: 'continue_later' | 'switch_task') => {
    if (!session) return
    if (!pauseReason.trim() || !pauseNextStep.trim()) {
      toast(locale === 'zh' ? '请填写暂停原因和回来后的第一步。' : 'Add a pause reason and the first step for your return.')
      return
    }
    setSubmitting(true)
    try {
      const minutes = Math.max(Math.floor(elapsedSeconds / 60), 0)
      const preferred = resumePreference === 'soon'
        ? new Date(Date.now() + 10 * 60_000).toISOString()
        : resumePreference === 'later_today' && preferredResumeAt ? new Date(preferredResumeAt).toISOString() : null
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession; context_dump: Record<string, unknown> | null; interruption: ExecutionInterruption; pause_review: ExecutionImpact; ready_queue: ReadyQueueItem[]; calendar_diff: LocalCalendarDiff | null; proposed_plan: Record<string, unknown> | null; planning_warning: string | null }>>('/api/execution-sessions/interrupt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, interruption_action: action, actual_minutes: minutes, remaining_minutes: displayRemaining, pause_reason: pauseReason, progress: pauseProgress, next_step: pauseNextStep, resume_preference: resumePreference, preferred_resume_at: preferred, request_id: requestId(`pause-${action}`) }),
      })
      setCurrent({ mode: 'paused', session: result.data.execution_session, task })
      setPausePrompt(false)
      setPauseAction(null)
      setNow(Date.now())
      setReadyQueue(action === 'switch_task' ? result.data.ready_queue || [] : [])
      setResumeImpact(result.data.pause_review.requires_plan_adjustment ? result.data.pause_review : null)
      setPausePrompt(action === 'switch_task')
      setPauseAction(null)
      setPauseReason(''); setPauseProgress(''); setPauseNextStep('')
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'pause', executionSession: result.data.execution_session } }))
      await loadExecution()
      setResumeImpact(null)
      toast(t('execution.paused'))
      if (result.data.planning_warning) toast.warning(result.data.planning_warning)
      if (action === 'continue_later' && result.data.proposed_plan) router.push('/app/plan?adjust=continue-later')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.pauseFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const switchToReadyTask = async (candidate: ReadyQueueItem) => {
    setSubmitting(true)
    try {
      await apiRequest('/api/execution-sessions/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ execution_session_id: candidate.execution_session_id, request_id: requestId('switch-task') }) })
      setReadyQueue([]); setPausePrompt(false); setPauseAction(null)
      await loadExecution()
      toast(locale === 'zh' ? `已切换到“${candidate.task_title}”` : `Switched to “${candidate.task_title}”`)
    } catch (error) { toast.error(error instanceof Error ? error.message : t('execution.startFailed')) }
    finally { setSubmitting(false) }
  }

  const takeBreak = async (minutes: number) => {
    if (!session || !isActivelyRunning) return
    setSubmitting(true)
    try {
      const activeMinutes = Math.max(Math.floor(elapsedSeconds / 60), 0)
      const resumeAt = new Date(Date.now() + minutes * 60_000).toISOString()
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession; pause_review: ExecutionImpact }>>('/api/execution-sessions/interrupt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, interruption_action: 'short_break', actual_minutes: activeMinutes, remaining_minutes: displayRemaining, pause_reason: 'normal_break', resume_preference: 'soon', preferred_resume_at: resumeAt, break_minutes: minutes, request_id: requestId('break') }),
      })
      setCurrent({ mode: 'paused', session: result.data.execution_session, task })
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'break', breakMinutes: minutes, executionSession: result.data.execution_session } }))
      toast(locale === 'zh' ? `已开始 ${minutes} 分钟休息` : `${minutes}-minute break started`)
    } catch (error) { toast(error instanceof Error ? error.message : t('execution.pauseFailed')) }
    finally { setSubmitting(false) }
  }

  const askHumanOS = () => {
    if (!session) return
    router.push(`/app/check-in?mode=daily&source=help-decide&task_id=${encodeURIComponent(session.task_id)}`)
  }

  const endSession = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const minutes = Math.max(Math.ceil(elapsedSeconds / 60), Number(session.actual_minutes || 0))
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession }>>('/api/execution-sessions/end', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, actual_minutes: minutes, request_id: requestId('end') }),
      })
      setActualMinutes(minutes)
      setRemainingMinutes(Math.max(Number(result.data.execution_session.session_remaining_minutes ?? plannedMinutes - minutes), 0))
      setEndedSession(result.data.execution_session)
      setCurrent({ mode: 'none', session: null })
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'end', executionSession: result.data.execution_session } }))
      toast(t('execution.ended'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.endFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const submitFeedback = async () => {
    if (!endedSession) return
    setSubmitting(true)
    try {
      const result = await apiRequest<{ data: ExecutionFeedbackResult }>('/api/execution-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: endedSession.task_id,
          execution_session_id: endedSession.execution_session_id,
          request_id: requestId('feedback'),
          trigger: 'session_finished',
          task_evaluation: {
            completion,
            actual_minutes: actualMinutes,
            remaining_duration_minutes: completion === 'completed' ? 0 : remainingMinutes,
            progress,
            next_step: feedbackNextStep,
            remaining_work: remainingWork,
            perceived_difficulty: difficulty,
          },
          state_evaluation: { focus_after: focusAfter, energy_after: energyAfter, stress_after: stressAfter },
          recommendation_evaluation: { timing_fit: timingFit, session_length_fit: sessionLengthFit },
          schedule_action: scheduleAction,
        }),
      })
      setEndedSession(null)
      window.dispatchEvent(new CustomEvent('humanos:plan-updated', {
        detail: { source: 'execution-feedback', task: result.data.task, executionSession: result.data.execution_session },
      }))
      await loadExecution()
      toast(t('execution.feedbackSaved'))
      if (result.data.requires_plan_adjustment) window.location.href = '/app/plan?adjust=remaining-work'
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.feedbackFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const requestExecutionReplan = async () => {
    if (!session) return
    setSubmitting(true)
    setReplanning(true)
    try {
      const accepted = await apiRequest<any>('/api/plans/replan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'today', trigger: 'execution_delay', affected_task_ids: [session.task_id] }) })
      const job = accepted?.data?.replan?.job || accepted?.replan?.job || accepted?.job
      if (!job?.job_id) throw new Error(locale === 'zh' ? '后端没有创建重排任务' : 'The backend did not create a replan job')
      let latest = job
      for (let attempt = 0; attempt < 180 && !['completed', 'failed'].includes(String(latest.status)); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const result = await apiRequest<any>(`/api/background-jobs?job_id=${encodeURIComponent(job.job_id)}`)
        latest = result?.job || result?.data?.job || latest
      }
      if (latest.status !== 'completed') throw new Error(latest.error || (locale === 'zh' ? '今日计划重排失败' : 'Today replan failed'))
      window.dispatchEvent(new CustomEvent('humanos:plan-revision'))
      await loadExecution()
      toast(locale === 'zh' ? '新的今日安排草案已生成，请确认后生效' : 'The revised draft is ready for confirmation')
      setResumeImpact(null)
      router.push('/app?review=replan')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Replan failed') }
    finally { setSubmitting(false); setReplanning(false) }
  }

  const resumeDeferred = async (deferred: ExecutionSession) => {
    setSubmitting(true)
    try {
      const analysis = await apiRequest<ExecutionResourceEnvelope<{ impact: ExecutionImpact }>>('/api/execution-sessions/impact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ execution_session_id: deferred.execution_session_id, remaining_minutes: deferred.remaining_at_pause ?? deferred.session_remaining_minutes, action: 'resume' }) })
      if (analysis.data.impact.requires_plan_adjustment) {
        setCurrent({ mode: 'paused', session: deferred, task: deferred.task })
        setResumeImpact(analysis.data.impact)
        return
      }
      await apiRequest('/api/execution-sessions/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ execution_session_id: deferred.execution_session_id, request_id: requestId('resume-deferred') }) })
      await loadExecution()
      toast(t('execution.started'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.startFailed'))
    } finally { setSubmitting(false) }
  }

  const statusLabel = useMemo(() => t(`execution.mode_${current?.mode || 'none'}`), [current?.mode, t])

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>

  return (
    <main className="humanos-operating-page h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-28 pt-6 md:px-8">
      {replanning && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl border bg-card p-7 text-center shadow-2xl"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><h2 className="mt-4 text-lg font-semibold">{locale === 'zh' ? '正在重新安排今天' : 'Replanning today'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{locale === 'zh' ? '正在根据已完成时间、剩余工作和后续任务生成新的计划草案。完成后将返回日历。' : 'Building a revised draft from completed time, remaining work, and later sessions. You will return to the calendar when it is ready.'}</p></div></div>}
      <div className="humanos-operating-container humanos-focus-container mx-auto max-w-6xl space-y-6">
        <header>
          <Link href="/app" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('execution.workspace')}</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Focus</p>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{t('execution.title')}</h1><p className="mt-2 text-muted-foreground">{t('execution.subtitle')}</p></div><span className="w-fit rounded-full border bg-background/70 px-4 py-1.5 text-sm">{statusLabel}</span></div>
        </header>

        {breakSession && <Card className="overflow-hidden border-sky-300 bg-gradient-to-br from-sky-50 via-background to-emerald-50"><CardHeader><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">{locale === 'zh' ? '短暂休息' : 'Timed break'}</p><CardTitle className="mt-2">{breakFinished ? (locale === 'zh' ? '休息结束' : 'Break complete') : (locale === 'zh' ? '先离开屏幕一会儿' : 'Step away for a moment')}</CardTitle><CardDescription className="mt-1">{locale === 'zh' ? '任务上下文和计时状态已由后端保存，刷新页面不会丢失。' : 'Task context and timing are persisted by the backend and survive refreshes.'}</CardDescription></div><Clock3 className="h-6 w-6 text-sky-700" /></div></CardHeader><CardContent><div className="rounded-2xl border bg-background/80 p-6 text-center"><p className="font-mono text-5xl font-semibold tracking-tight">{durationLabel(breakRemainingSeconds)}</p><p className="mt-2 text-sm text-muted-foreground">{breakFinished ? (locale === 'zh' ? '可以回到原任务，或说明你还没准备好。' : 'Resume the same task or say you are not ready.') : (locale === 'zh' ? '休息剩余时间' : 'Break remaining')}</p></div>{breakFinished && <div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={() => void resumeDeferred(breakSession)} disabled={submitting}><Play className="mr-2 h-4 w-4" />{locale === 'zh' ? '恢复原任务' : 'Resume task'}</Button><Button variant="outline" onClick={() => router.push(`/app/check-in?mode=daily&source=break-not-ready&task_id=${encodeURIComponent(breakSession.task_id)}`)}>{locale === 'zh' ? '我还没准备好' : "I'm not ready"}</Button></div>}</CardContent></Card>}

        {overdueSessions.length > 0 && current?.mode !== 'overdue_running' && <Card className="border-amber-400 bg-amber-50 text-amber-950 shadow-lg shadow-amber-950/10 dark:border-amber-500/60 dark:bg-[#211a0d] dark:text-amber-50"><CardHeader><CardTitle>{locale === 'zh' ? '有超时执行记录待处理' : 'An overdue execution record needs review'}</CardTitle><CardDescription className="text-amber-900/70 dark:text-amber-100/70">{locale === 'zh' ? '它不再占据当前专注位置，但需由你确认实际结果。' : 'It no longer occupies the current focus slot, but its actual outcome still needs your confirmation.'}</CardDescription></CardHeader><CardContent className="space-y-2">{overdueSessions.map((item) => <div key={item.execution_session_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-white p-4 shadow-sm dark:border-amber-700/60 dark:bg-[#090e16]"><div><p className="font-medium">{item.task_title || item.title || item.task_id}</p><p className="text-xs text-amber-900/60 dark:text-amber-100/60">{item.planned_end_at ? new Date(item.planned_end_at).toLocaleString() : ''}</p></div><Button size="sm" variant="outline" className="border-amber-400 bg-white hover:bg-amber-100 dark:border-amber-600 dark:bg-[#111827] dark:hover:bg-amber-950" onClick={() => setCurrent({ mode: 'overdue_running', session: item, task: item.task, requires_resolution: true })}>{locale === 'zh' ? '处理记录' : 'Resolve record'}</Button></div>)}</CardContent></Card>}

        {endedSession ? (
          <Card className="border-primary/30">
            <CardHeader><CardTitle>{t('execution.feedbackTitle')}</CardTitle><CardDescription>{t('execution.feedbackDescription')}</CardDescription></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm"><span>{t('execution.completion')}</span><select className="h-10 rounded-md border bg-background px-3" value={completion} onChange={(event) => setCompletion(event.target.value as typeof completion)}><option value="completed">{t('execution.completed')}</option><option value="some_progress">{t('execution.partial')}</option><option value="no_progress">{t('execution.noProgress')}</option><option value="did_not_start">{t('execution.didNotStart')}</option></select></label>
              <label className="grid gap-2 text-sm"><span>{t('execution.actualMinutes')}</span><input className="h-10 rounded-md border bg-background px-3" type="number" min={0} value={actualMinutes} onChange={(event) => setActualMinutes(Number(event.target.value))} /></label>
              {completion !== 'completed' && <><label className="grid gap-2 text-sm"><span>{t('execution.remainingMinutes')}</span><input className="h-10 rounded-md border bg-background px-3" type="number" min={0} value={remainingMinutes} onChange={(event) => setRemainingMinutes(Number(event.target.value))} /></label><label className="grid gap-2 text-sm"><span>{t('execution.remainingWork')}</span><input className="h-10 rounded-md border bg-background px-3" value={remainingWork} onChange={(event) => setRemainingWork(event.target.value)} /></label></>}
              <label className="grid gap-2 text-sm"><span>{t('execution.progress')}</span><input className="h-10 rounded-md border bg-background px-3" value={progress} onChange={(event) => setProgress(event.target.value)} /></label>
              {completion !== 'completed' && <label className="grid gap-2 text-sm"><span>{t('execution.feedbackNextStep')}</span><input className="h-10 rounded-md border bg-background px-3" value={feedbackNextStep} onChange={(event) => setFeedbackNextStep(event.target.value)} /></label>}
              {completion === 'completed' && actualMinutes < plannedMinutes && <label className="grid gap-2 text-sm md:col-span-2"><span>{t('execution.earlyFinishAction')}</span><select className="h-10 rounded-md border bg-background px-3" value={scheduleAction} onChange={(event) => setScheduleAction(event.target.value as typeof scheduleAction)}><option value="keep_time_free">{t('execution.keepTimeFree')}</option><option value="review_today">{t('execution.reviewToday')}</option></select></label>}
              <label className="grid gap-2 text-sm"><span>{t('execution.difficulty')} {difficulty}/7</span><input type="range" min={1} max={7} value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} /></label>
              {[['focusAfter', focusAfter, setFocusAfter], ['energyAfter', energyAfter, setEnergyAfter], ['stressAfter', stressAfter, setStressAfter]].map(([key, value, setter]) => <label key={String(key)} className="grid gap-2 text-sm"><span>{t(`execution.${key}`)} {String(value)}/7</span><input type="range" min={1} max={7} value={Number(value)} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))} /></label>)}
              <label className="grid gap-2 text-sm"><span>{t('execution.timingFit')}</span><select className="h-10 rounded-md border bg-background px-3" value={timingFit} onChange={(event) => setTimingFit(event.target.value)}><option value="good">{t('execution.good')}</option><option value="too_early">{t('execution.tooEarly')}</option><option value="too_late">{t('execution.tooLate')}</option></select></label>
              <label className="grid gap-2 text-sm"><span>{t('execution.lengthFit')}</span><select className="h-10 rounded-md border bg-background px-3" value={sessionLengthFit} onChange={(event) => setSessionLengthFit(event.target.value)}><option value="appropriate">{t('execution.appropriate')}</option><option value="too_short">{t('execution.tooShort')}</option><option value="too_long">{t('execution.tooLong')}</option></select></label>
              <div className="md:col-span-2"><Button className="w-full" onClick={submitFeedback} disabled={submitting}><CheckCircle2 className="mr-2 h-4 w-4" />{t('execution.saveFeedback')}</Button></div>
            </CardContent>
          </Card>
        ) : session ? (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="overflow-hidden border-primary/40 bg-white shadow-xl shadow-slate-950/10 dark:bg-[#111a28] dark:shadow-black/30">
              <CardHeader className="bg-primary/5"><CardDescription>{statusLabel}</CardDescription><CardTitle className="text-2xl md:text-4xl">{title}</CardTitle></CardHeader>
              <CardContent className="space-y-6 pt-6">
                {current?.mode === 'overdue_running' && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">{locale === 'zh' ? '计划结束时间已过' : 'The planned end time has passed'}</p><p className="mt-1">{locale === 'zh' ? '系统不会猜测你是否完成。如果已停止，请结束 Session 并记录实际结果；如果仍在继续，可保持运行。' : 'HumanOS will not guess whether you finished. End the session and record the outcome if you stopped, or leave it running if you are still working.'}</p></div>}
                <div className="rounded-2xl border bg-background p-6 text-center"><p className="font-mono text-5xl font-semibold tracking-tight md:text-7xl">{durationLabel(elapsedSeconds)}</p><p className="mt-2 text-sm text-muted-foreground">{t('execution.elapsed')}</p></div>
                <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">{t('execution.planned')}</p><p className="mt-1 text-xl font-semibold">{plannedMinutes} min</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">{t('execution.remaining')}</p><p className="mt-1 text-xl font-semibold">{displayRemaining} min</p></div></div>
                {pausePrompt && <div className="rounded-2xl border bg-muted/40 p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{locale === 'zh' ? '你现在需要什么？' : 'What do you need right now?'}</h3><p className="mt-1 text-sm text-muted-foreground">{locale === 'zh' ? '先选择动作，系统只收集这个动作真正需要的信息。' : 'Choose an action first. HumanOS only asks for information that action needs.'}</p></div><Button variant="ghost" size="sm" onClick={() => { setPausePrompt(false); setPauseAction(null) }}>{locale === 'zh' ? '取消' : 'Cancel'}</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{([['short_break', locale === 'zh' ? '短暂休息' : 'Take a short break'], ['continue_later', locale === 'zh' ? '晚些时候继续' : 'Continue this task later'], ['switch_task', locale === 'zh' ? '切换到其他任务' : 'Switch to another task'], ['help_decide', locale === 'zh' ? '让 HumanOS 帮我决定' : 'Help me decide']] as const).map(([value, label]) => <button key={value} onClick={() => setPauseAction(value)} className={`rounded-2xl border p-4 text-left text-sm font-medium transition-colors ${pauseAction === value ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted'}`}>{label}</button>)}</div>{pauseAction === 'switch_task' && readyQueue.length > 0 && <div className="mt-4 rounded-2xl border bg-background p-4"><p className="text-sm font-semibold">{locale === 'zh' ? '选择下一项任务' : 'Choose the next task'}</p><div className="mt-3 grid gap-2">{readyQueue.map((candidate) => <button key={candidate.execution_session_id} onClick={() => void switchToReadyTask(candidate)} disabled={submitting} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted disabled:opacity-50"><span><span className="block text-sm font-medium">{candidate.task_title}</span><span className="mt-1 block text-xs text-muted-foreground">{candidate.remaining_minutes ?? candidate.planned_work_minutes ?? 0} min · {candidate.priority || '—'}</span></span><Play className="h-4 w-4" /></button>)}</div></div>}{pauseAction === 'short_break' && <div className="mt-4 rounded-2xl border bg-background p-4"><p className="text-sm font-medium">{locale === 'zh' ? '休息多久？' : 'How long?'}</p><div className="mt-3 flex flex-wrap gap-2">{[5,10,15].map((minutes) => <Button key={minutes} variant="outline" onClick={() => void takeBreak(minutes)} disabled={submitting}>{minutes} {locale === 'zh' ? '分钟' : 'min'}</Button>)}</div></div>}{(pauseAction === 'continue_later' || pauseAction === 'switch_task') && <div className="mt-4 rounded-2xl border bg-background p-4"><div className="grid gap-3"><label className="block text-sm"><span>{locale === 'zh' ? '为什么暂停？' : 'Why are you pausing?'}</span><textarea value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} className="mt-2 min-h-16 w-full rounded-xl border bg-background p-3" /></label><label className="block text-sm"><span>{locale === 'zh' ? '你停在了哪里？' : 'Where did you stop?'}</span><textarea value={pauseProgress} onChange={(event) => setPauseProgress(event.target.value)} className="mt-2 min-h-16 w-full rounded-xl border bg-background p-3" /></label><label className="block text-sm"><span>{locale === 'zh' ? '回来后第一步做什么？' : 'What should you do first when you return?'}</span><textarea value={pauseNextStep} onChange={(event) => setPauseNextStep(event.target.value)} className="mt-2 min-h-16 w-full rounded-xl border bg-background p-3" /></label></div>{pauseAction === 'continue_later' && <><div className="mt-4 grid gap-2 sm:grid-cols-3">{([['soon', locale === 'zh' ? '10 分钟后' : 'In 10 minutes'], ['later_today', locale === 'zh' ? '今天稍后' : 'Later today'], ['unknown', locale === 'zh' ? '暂不确定' : 'Not sure']] as const).map(([value, label]) => <button key={value} onClick={() => setResumePreference(value)} className={`rounded-xl border px-3 py-2 text-sm ${resumePreference === value ? 'border-primary bg-primary/10' : 'bg-background'}`}>{label}</button>)}</div>{resumePreference === 'later_today' && <input type="datetime-local" value={preferredResumeAt} onChange={(event) => setPreferredResumeAt(event.target.value)} className="mt-3 w-full rounded-xl border bg-background px-3 py-2" />}</>}<div className="mt-4 flex justify-end"><Button onClick={() => void pauseSession(pauseAction)} disabled={submitting || !pauseReason.trim() || !pauseNextStep.trim() || (pauseAction === 'continue_later' && resumePreference === 'later_today' && !preferredResumeAt)}><Pause className="mr-2 h-4 w-4" />{pauseAction === 'switch_task' ? (locale === 'zh' ? '保存并查看可切换任务' : 'Save and view ready tasks') : (locale === 'zh' ? '保存并暂停' : 'Save and pause')}</Button></div></div>}{pauseAction === 'help_decide' && <div className="mt-4 rounded-2xl border bg-background p-4"><p className="text-sm text-muted-foreground">{locale === 'zh' ? 'HumanOS 会询问中断原因和此刻的专注、精力、压力，再给出一个具体建议。' : 'HumanOS will ask why you stopped and collect current focus, energy, and stress before making one concrete recommendation.'}</p><Button className="mt-3" onClick={askHumanOS}>{locale === 'zh' ? '继续，让 HumanOS 帮我决定' : 'Continue to recommendation'}</Button></div>}</div>}
                {current?.requires_resolution && current.mode !== 'overdue_running' && <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">{locale === 'zh' ? '开始下一项前，请先处理上方未结束的超时记录。' : 'Resolve the unfinished overdue record above before starting the next session.'}</p>}
                <div className="flex flex-wrap justify-center gap-3">{isActivelyRunning ? <><Button variant="outline" onClick={() => { setPausePrompt(true); setPauseAction(null) }} disabled={submitting || pausePrompt}><Pause className="mr-2 h-4 w-4" />{t('execution.pause')}</Button><Button onClick={endSession} disabled={submitting}><Square className="mr-2 h-4 w-4" />{t('execution.end')}</Button></> : <><Button onClick={() => void startSession()} disabled={submitting || Boolean(current?.requires_resolution)} title={current?.requires_resolution ? (locale === 'zh' ? '请先处理超时记录' : 'Resolve overdue record first') : undefined}><Play className="mr-2 h-4 w-4" />{current?.mode === 'paused' ? t('execution.resume') : t('execution.start')}</Button>{current?.mode === 'paused' && <Button variant="outline" onClick={endSession} disabled={submitting}><Square className="mr-2 h-4 w-4" />{t('execution.end')}</Button>}</>}</div>
                {resumeImpact && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h3 className="font-semibold">{locale === 'zh' ? '恢复任务将影响后续安排' : 'Resuming will affect your schedule'}</h3><p className="mt-2 text-sm">{locale === 'zh' ? `按当前剩余时间，预计在 ${new Date(resumeImpact.estimated_end_at).toLocaleTimeString()} 完成。` : `With the remaining work, this task is expected to finish at ${new Date(resumeImpact.estimated_end_at).toLocaleTimeString()}.`}</p><div className="mt-3 space-y-2">{resumeImpact.affected_sessions.map((affected) => <div key={affected.execution_session_id} className="rounded-xl bg-white/70 px-3 py-2 text-sm"><strong>{affected.task_title || affected.task_id}</strong><span className="ml-2">{locale === 'zh' ? `重叠 ${affected.overlap_minutes} 分钟` : `${affected.overlap_minutes} min overlap`}</span></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void startSession(true)} disabled={submitting}>{locale === 'zh' ? '仍然恢复，保持原计划' : 'Resume without changes'}</Button><Button size="sm" onClick={() => void requestExecutionReplan()} disabled={submitting}>{locale === 'zh' ? '重新生成今日计划' : 'Regenerate today'}</Button><Button size="sm" variant="secondary" asChild><Link href="/app/plan?adjust=manual">{locale === 'zh' ? '我自己修改' : 'Edit manually'}</Link></Button><Button size="sm" variant="ghost" onClick={() => setResumeImpact(null)}>{locale === 'zh' ? '暂不恢复' : 'Not now'}</Button></div></div>}
              </CardContent>
            </Card>
            <div className="space-y-4"><Card><CardHeader><CardTitle className="text-lg">{t('execution.context')}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>{task?.context || t('execution.noContext')}</p>{nextStep && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-semibold text-primary">{t('execution.nextStep')}</p><p className="mt-1">{nextStep}</p></div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-lg">{t('execution.schedule')}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{session.planned_start_at ? new Date(session.planned_start_at).toLocaleString() : '—'}</p><p className="flex items-center gap-2"><TimerReset className="h-4 w-4" />{plannedMinutes} min</p></CardContent></Card></div>
          </div>
        ) : (
          <Card className="py-12 text-center"><CardContent><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted"><Clock3 /></div><h2 className="text-xl font-semibold">{t('execution.noSession')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('execution.noSessionDescription')}</p><Button className="mt-5" asChild><Link href="/app/plan">{t('execution.openPlan')}</Link></Button></CardContent></Card>
        )}

        {(current?.deferred_sessions?.filter((item) => item.interruption_action !== 'short_break').length || 0) > 0 && <Card className="border-amber-300 bg-amber-50/60"><CardHeader><CardTitle>{locale === 'zh' ? '待恢复任务' : 'Deferred sessions'}</CardTitle><CardDescription>{locale === 'zh' ? '这些任务已退出当前执行队列，不会阻塞下一项安排。' : 'These sessions no longer block the next scheduled task.'}</CardDescription></CardHeader><CardContent className="space-y-3">{current?.deferred_sessions?.filter((item) => item.interruption_action !== 'short_break').map((item) => <div key={item.execution_session_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4"><div><p className="font-medium">{item.task_title || item.title || item.task_id}</p><p className="mt-1 text-xs text-muted-foreground">{locale === 'zh' ? `剩余 ${item.remaining_at_pause ?? item.session_remaining_minutes ?? 0} 分钟 · ${item.pause_reason || '未填写暂停原因'}` : `${item.remaining_at_pause ?? item.session_remaining_minutes ?? 0} min remaining · ${item.pause_reason || 'No pause reason'}`}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void resumeDeferred(item)} disabled={submitting}>{locale === 'zh' ? '现在恢复' : 'Resume now'}</Button><Button size="sm" asChild><Link href="/app/plan?adjust=deferred-session">{locale === 'zh' ? '安排恢复时间' : 'Schedule return'}</Link></Button></div></div>)}</CardContent></Card>}
        <Card><CardHeader><CardTitle>{t('execution.history')}</CardTitle><CardDescription>{t('execution.historyDescription')}</CardDescription></CardHeader><CardContent className="space-y-2">{history.length === 0 ? <p className="text-sm text-muted-foreground">{t('execution.noHistory')}</p> : history.slice(0, 12).map((item) => <div key={item.execution_session_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><div><p className="font-medium">{item.task_title || item.title || item.task_id}</p><p className="text-xs text-muted-foreground">{item.planned_start_at ? new Date(item.planned_start_at).toLocaleString() : item.block_id}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{item.status}</span></div>)}</CardContent></Card>
      </div>
    </main>
  )
}
