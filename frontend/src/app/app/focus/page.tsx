'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock3, Loader2, Pause, Play, Square, TimerReset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiRequest } from '@/lib/client/api'
import type { CurrentExecution, ExecutionSession } from '@/lib/contracts/execution-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

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

function requestId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export default function FocusPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [current, setCurrent] = useState<CurrentExecution | null>(null)
  const [history, setHistory] = useState<ExecutionSession[]>([])
  const [endedSession, setEndedSession] = useState<ExecutionSession | null>(null)
  const [now, setNow] = useState(Date.now())
  const [actualMinutes, setActualMinutes] = useState(0)
  const [completion, setCompletion] = useState<'partial' | 'completed'>('partial')
  const [remainingMinutes, setRemainingMinutes] = useState(0)
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
        apiRequest<CurrentExecution>('/api/execution-sessions/current'),
        apiRequest<{ execution_sessions: ExecutionSession[] }>('/api/execution-sessions'),
      ])
      setCurrent(currentData)
      setHistory(historyData.execution_sessions || [])
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
    if (current?.mode !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [current?.mode])

  const session = current?.session || null
  const task = current?.task || session?.task || null
  const title = session?.task_title || session?.title || task?.title || t('execution.untitledTask')
  const startedAt = timestamp(session?.started_at)
  const persistedMinutes = Number(session?.actual_minutes || 0)
  const elapsedSeconds = current?.mode === 'running' && startedAt
    ? persistedMinutes * 60 + Math.max(Math.floor((now - startedAt) / 1000), 0)
    : persistedMinutes * 60

  const plannedMinutes = Number(session?.planned_work_minutes || 0)
  const displayRemaining = session?.session_remaining_minutes == null
    ? Math.max(plannedMinutes - Math.floor(elapsedSeconds / 60), 0)
    : Number(session.session_remaining_minutes)

  const contextWindow = (task?.contextWindow || {}) as Record<string, unknown>
  const nextStep = String(contextWindow.nextStep || contextWindow.next_step || '')

  const startSession = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const result = await apiRequest<{ execution_session: ExecutionSession }>('/api/execution-sessions/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, request_id: requestId('start') }),
      })
      setCurrent({ mode: 'running', session: result.execution_session, task })
      setNow(Date.now())
      toast(t('execution.started'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.startFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const pauseSession = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const minutes = Math.max(Math.floor(elapsedSeconds / 60), 0)
      const result = await apiRequest<{ execution_session: ExecutionSession }>('/api/execution-sessions/pause', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, actual_minutes: minutes, request_id: requestId('pause') }),
      })
      setCurrent({ mode: 'paused', session: result.execution_session, task })
      toast(t('execution.paused'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.pauseFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const endSession = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const minutes = Math.max(Math.ceil(elapsedSeconds / 60), Number(session.actual_minutes || 0))
      const result = await apiRequest<{ execution_session: ExecutionSession }>('/api/execution-sessions/end', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, actual_minutes: minutes, request_id: requestId('end') }),
      })
      setActualMinutes(minutes)
      setRemainingMinutes(Math.max(Number(result.execution_session.session_remaining_minutes ?? plannedMinutes - minutes), 0))
      setEndedSession(result.execution_session)
      setCurrent({ mode: 'none', session: null })
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
      await apiRequest('/api/execution-feedback', {
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
            perceived_difficulty: difficulty,
          },
          state_evaluation: { focus_after: focusAfter, energy_after: energyAfter, stress_after: stressAfter },
          recommendation_evaluation: { timing_fit: timingFit, session_length_fit: sessionLengthFit },
        }),
      })
      setEndedSession(null)
      await loadExecution()
      toast(t('execution.feedbackSaved'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('execution.feedbackFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const statusLabel = useMemo(() => t(`execution.mode_${current?.mode || 'none'}`), [current?.mode, t])

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>

  return (
    <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.16),transparent_42%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.45))] px-4 pb-28 pt-6 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <Link href="/app" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('execution.workspace')}</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Focus</p>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{t('execution.title')}</h1><p className="mt-2 text-muted-foreground">{t('execution.subtitle')}</p></div><span className="w-fit rounded-full border bg-background/70 px-4 py-1.5 text-sm">{statusLabel}</span></div>
        </header>

        {endedSession ? (
          <Card className="border-primary/30">
            <CardHeader><CardTitle>{t('execution.feedbackTitle')}</CardTitle><CardDescription>{t('execution.feedbackDescription')}</CardDescription></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm"><span>{t('execution.completion')}</span><select className="h-10 rounded-md border bg-background px-3" value={completion} onChange={(event) => setCompletion(event.target.value as 'partial' | 'completed')}><option value="partial">{t('execution.partial')}</option><option value="completed">{t('execution.completed')}</option></select></label>
              <label className="grid gap-2 text-sm"><span>{t('execution.actualMinutes')}</span><input className="h-10 rounded-md border bg-background px-3" type="number" min={0} value={actualMinutes} onChange={(event) => setActualMinutes(Number(event.target.value))} /></label>
              {completion === 'partial' && <label className="grid gap-2 text-sm"><span>{t('execution.remainingMinutes')}</span><input className="h-10 rounded-md border bg-background px-3" type="number" min={0} value={remainingMinutes} onChange={(event) => setRemainingMinutes(Number(event.target.value))} /></label>}
              <label className="grid gap-2 text-sm"><span>{t('execution.difficulty')} {difficulty}/7</span><input type="range" min={1} max={7} value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} /></label>
              {[['focusAfter', focusAfter, setFocusAfter], ['energyAfter', energyAfter, setEnergyAfter], ['stressAfter', stressAfter, setStressAfter]].map(([key, value, setter]) => <label key={String(key)} className="grid gap-2 text-sm"><span>{t(`execution.${key}`)} {String(value)}/7</span><input type="range" min={1} max={7} value={Number(value)} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))} /></label>)}
              <label className="grid gap-2 text-sm"><span>{t('execution.timingFit')}</span><select className="h-10 rounded-md border bg-background px-3" value={timingFit} onChange={(event) => setTimingFit(event.target.value)}><option value="good">{t('execution.good')}</option><option value="too_early">{t('execution.tooEarly')}</option><option value="too_late">{t('execution.tooLate')}</option></select></label>
              <label className="grid gap-2 text-sm"><span>{t('execution.lengthFit')}</span><select className="h-10 rounded-md border bg-background px-3" value={sessionLengthFit} onChange={(event) => setSessionLengthFit(event.target.value)}><option value="appropriate">{t('execution.appropriate')}</option><option value="too_short">{t('execution.tooShort')}</option><option value="too_long">{t('execution.tooLong')}</option></select></label>
              <div className="md:col-span-2"><Button className="w-full" onClick={submitFeedback} disabled={submitting}><CheckCircle2 className="mr-2 h-4 w-4" />{t('execution.saveFeedback')}</Button></div>
            </CardContent>
          </Card>
        ) : session ? (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="overflow-hidden border-primary/30">
              <CardHeader className="bg-primary/5"><CardDescription>{statusLabel}</CardDescription><CardTitle className="text-2xl md:text-4xl">{title}</CardTitle></CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="rounded-2xl border bg-background p-6 text-center"><p className="font-mono text-5xl font-semibold tracking-tight md:text-7xl">{durationLabel(elapsedSeconds)}</p><p className="mt-2 text-sm text-muted-foreground">{t('execution.elapsed')}</p></div>
                <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">{t('execution.planned')}</p><p className="mt-1 text-xl font-semibold">{plannedMinutes} min</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">{t('execution.remaining')}</p><p className="mt-1 text-xl font-semibold">{displayRemaining} min</p></div></div>
                <div className="flex flex-wrap justify-center gap-3">{current?.mode === 'running' ? <><Button variant="outline" onClick={pauseSession} disabled={submitting}><Pause className="mr-2 h-4 w-4" />{t('execution.pause')}</Button><Button onClick={endSession} disabled={submitting}><Square className="mr-2 h-4 w-4" />{t('execution.end')}</Button></> : <><Button onClick={startSession} disabled={submitting}><Play className="mr-2 h-4 w-4" />{current?.mode === 'paused' ? t('execution.resume') : t('execution.start')}</Button>{current?.mode === 'paused' && <Button variant="outline" onClick={endSession} disabled={submitting}><Square className="mr-2 h-4 w-4" />{t('execution.end')}</Button>}</>}</div>
              </CardContent>
            </Card>
            <div className="space-y-4"><Card><CardHeader><CardTitle className="text-lg">{t('execution.context')}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>{task?.context || t('execution.noContext')}</p>{nextStep && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs font-semibold text-primary">{t('execution.nextStep')}</p><p className="mt-1">{nextStep}</p></div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-lg">{t('execution.schedule')}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{session.planned_start_at ? new Date(session.planned_start_at).toLocaleString() : '—'}</p><p className="flex items-center gap-2"><TimerReset className="h-4 w-4" />{plannedMinutes} min</p></CardContent></Card></div>
          </div>
        ) : (
          <Card className="py-12 text-center"><CardContent><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted"><Clock3 /></div><h2 className="text-xl font-semibold">{t('execution.noSession')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('execution.noSessionDescription')}</p><Button className="mt-5" asChild><Link href="/app/plan">{t('execution.openPlan')}</Link></Button></CardContent></Card>
        )}

        <Card><CardHeader><CardTitle>{t('execution.history')}</CardTitle><CardDescription>{t('execution.historyDescription')}</CardDescription></CardHeader><CardContent className="space-y-2">{history.length === 0 ? <p className="text-sm text-muted-foreground">{t('execution.noHistory')}</p> : history.slice(0, 12).map((item) => <div key={item.execution_session_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><div><p className="font-medium">{item.task_title || item.title || item.task_id}</p><p className="text-xs text-muted-foreground">{item.planned_start_at ? new Date(item.planned_start_at).toLocaleString() : item.block_id}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{item.status}</span></div>)}</CardContent></Card>
      </div>
    </main>
  )
}

