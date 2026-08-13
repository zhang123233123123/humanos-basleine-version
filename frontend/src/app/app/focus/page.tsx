'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Coffee,
  HelpCircle,
  Loader2,
  Pause,
  Play,
  Shuffle,
  Square,
  TimerReset,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiRequest } from '@/lib/client/api'
import { requestId } from '@/lib/client/request-id'
import type {
  CurrentExecution,
  ExecutionFeedbackResult,
  ExecutionImpact,
  ExecutionResourceEnvelope,
  ExecutionSession,
} from '@/lib/contracts/execution-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

type PauseView = 'closed' | 'menu' | 'break' | 'later' | 'switch-context' | 'switch-queue' | 'help' | 'recommendation'
type Completion = 'completed' | 'some_progress' | 'no_progress' | 'did_not_start'

interface InterruptionRecommendation {
  action: 'short_break' | 'continue_later' | 'switch_task'
  break_minutes?: number | null
  selected_task_id?: string | null
  explanation: string
  deadline_warning?: boolean
  deadline_options?: string[]
  impact?: ExecutionImpact
  provider?: string
}

function timestamp(value: unknown): number | null {
  if (!value) return null
  if (typeof value === 'number') return value > 9_999_999_999 ? value : value * 1000
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

function localDateTime(minutesFromNow: number) {
  const value = new Date(Date.now() + minutesFromNow * 60_000)
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatPlannedTime(session: ExecutionSession | null) {
  if (!session?.planned_start_at) return 'No scheduled time'
  const start = new Date(session.planned_start_at)
  const end = session.planned_end_at ? new Date(session.planned_end_at) : null
  return `${start.toLocaleDateString(undefined, { weekday: 'short' })} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${end ? `–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
}

export default function FocusPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [replanning, setReplanning] = useState(false)
  const [current, setCurrent] = useState<CurrentExecution | null>(null)
  const [history, setHistory] = useState<ExecutionSession[]>([])
  const [endedSession, setEndedSession] = useState<ExecutionSession | null>(null)
  const [pauseView, setPauseView] = useState<PauseView>('closed')
  const [pauseReason, setPauseReason] = useState('tired')
  const [pauseProgress, setPauseProgress] = useState('')
  const [pauseNextStep, setPauseNextStep] = useState('')
  const [preferredResumeAt, setPreferredResumeAt] = useState(localDateTime(180))
  const [resumeInstruction, setResumeInstruction] = useState('')
  const [resumeChoice, setResumeChoice] = useState<'tonight' | 'tomorrow' | 'custom' | 'recommend'>('tonight')
  const [customBreakMinutes, setCustomBreakMinutes] = useState(10)
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null)
  const [resumeImpact, setResumeImpact] = useState<ExecutionImpact | null>(null)
  const [recommendation, setRecommendation] = useState<InterruptionRecommendation | null>(null)
  const [focusNow, setFocusNow] = useState(4)
  const [energyNow, setEnergyNow] = useState(4)
  const [stressNow, setStressNow] = useState(4)
  const [now, setNow] = useState(Date.now())
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [progress, setProgress] = useState('')
  const [feedbackNextStep, setFeedbackNextStep] = useState('')

  const loadExecution = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const [currentData, historyData] = await Promise.all([
        apiRequest<ExecutionResourceEnvelope<{ current: CurrentExecution }>>('/api/execution-sessions/current'),
        apiRequest<ExecutionResourceEnvelope<{ execution_sessions: ExecutionSession[] }>>('/api/execution-sessions'),
      ])
      const next = currentData.data.current
      setCurrent(next)
      setHistory(historyData.data.execution_sessions || [])
      if (next.mode === 'session_ended' && next.session) setEndedSession(next.session)
      if (next.mode === 'paused' && next.session?.pause_reason === 'short_break') {
        const savedBreakEnd = timestamp(next.session.preferred_resume_at)
        if (savedBreakEnd) setBreakEndsAt(savedBreakEnd)
      } else if (next.mode !== 'paused') {
        setBreakEndsAt(null)
      }
      setNow(Date.now())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.loadFailed'))
    } finally {
      if (initial) setLoading(false)
    }
  }, [t])

  useEffect(() => { void loadExecution(true) }, [loadExecution])

  useEffect(() => {
    const refresh = () => void loadExecution(false)
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('humanos:plan-updated', refresh)
    window.addEventListener('humanos:plan-revision', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('humanos:plan-updated', refresh)
      window.removeEventListener('humanos:plan-revision', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadExecution])

  useEffect(() => {
    if (current?.mode !== 'running' && !breakEndsAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [current?.mode, breakEndsAt])

  const session = current?.session || endedSession || null
  const task = current?.task || session?.task || null
  const title = session?.task_title || session?.title || task?.title || t('execution.untitledTask')
  const activeSegmentStartedAt = timestamp(session?.resumed_at ?? session?.actual_start_at ?? session?.started_at)
  const persistedMinutes = Number(session?.accumulated_active_minutes ?? session?.actual_minutes ?? 0)
  const activeSegmentSeconds = current?.mode === 'running' && activeSegmentStartedAt
    ? Math.max(Math.floor((now - activeSegmentStartedAt) / 1000), 0)
    : 0
  const elapsedSeconds = persistedMinutes * 60 + activeSegmentSeconds
  const trackedMinutes = Math.max(Number(session?.live_active_minutes ?? 0), Math.ceil(elapsedSeconds / 60), Number(session?.actual_minutes ?? 0))
  const plannedMinutes = Number(session?.planned_work_minutes || 0)
  const persistedRemaining = session?.session_remaining_minutes == null
    ? Math.max(plannedMinutes - persistedMinutes, 0)
    : Number(session.session_remaining_minutes)
  const displayRemaining = Math.max(persistedRemaining - Math.floor(activeSegmentSeconds / 60), 0)
  const breakRemainingSeconds = breakEndsAt ? Math.max(Math.ceil((breakEndsAt - now) / 1000), 0) : 0
  const readyQueue = history.filter((item) => item.status === 'ready' && item.execution_session_id !== session?.execution_session_id)

  const statusLabel = useMemo(() => {
    if (endedSession) return 'Session ended'
    const labels: Record<string, string> = { running: 'In focus', paused: 'Paused', up_next: 'Up next', ready_to_start: 'Ready', empty: 'No session' }
    return labels[current?.mode || ''] || 'Ready'
  }, [current?.mode, endedSession])

  const startSession = async (target: ExecutionSession | null = session, skipImpactCheck = false) => {
    if (!target) return
    setSubmitting(true)
    try {
      if (target.execution_session_id === session?.execution_session_id && current?.mode === 'paused' && !skipImpactCheck) {
        const analysis = await apiRequest<ExecutionResourceEnvelope<{ impact: ExecutionImpact }>>('/api/execution-sessions/impact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ execution_session_id: target.execution_session_id, remaining_minutes: displayRemaining, action: 'resume' }),
        })
        if (analysis.data.impact.requires_plan_adjustment) {
          setResumeImpact(analysis.data.impact)
          return
        }
      }
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession }>>('/api/execution-sessions/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: target.execution_session_id, request_id: requestId('start') }),
      })
      setCurrent({ mode: 'running', session: result.data.execution_session, task: target.task || null })
      setEndedSession(null)
      setPauseView('closed')
      setBreakEndsAt(null)
      setResumeImpact(null)
      setNow(Date.now())
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'start', executionSession: result.data.execution_session } }))
      toast.success(target.execution_session_id === session?.execution_session_id ? 'Task resumed.' : 'Switched to the selected task.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.startFailed'))
    } finally { setSubmitting(false) }
  }

  const pauseCurrent = async (options: {
    reason: string
    resumePreference: 'soon' | 'later_today' | 'unknown'
    preferredResumeAt?: string | null
    breakMinutes?: number
  }) => {
    if (!session) throw new Error('No running session')
    const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession; pause_review: ExecutionImpact }>>('/api/execution-sessions/pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        execution_session_id: session.execution_session_id,
        actual_minutes: Math.max(Math.floor(elapsedSeconds / 60), 0),
        remaining_minutes: displayRemaining,
        pause_reason: options.reason,
        resume_preference: options.resumePreference,
        preferred_resume_at: options.preferredResumeAt || null,
        break_minutes: options.breakMinutes,
        request_id: requestId('pause'),
      }),
    })
    setCurrent({ mode: 'paused', session: result.data.execution_session, task })
    setResumeImpact(result.data.pause_review.requires_plan_adjustment ? result.data.pause_review : null)
    window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'pause', executionSession: result.data.execution_session } }))
    return result.data
  }

  const beginPause = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      await pauseCurrent({ reason: 'decision_pending', resumePreference: 'unknown' })
      setPauseView('menu')
      toast.info('Paused. Your tracked time and remaining work are saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.pauseFailed'))
    } finally { setSubmitting(false) }
  }

  const saveContext = async (reason: string, preferred: string | null) => {
    if (!session) return
    await apiRequest('/api/context-dumps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: session.task_id,
        execution_session_id: session.execution_session_id,
        progress: pauseProgress,
        next_action: pauseNextStep,
        stop_reason: reason,
        remaining_duration_minutes: displayRemaining,
        expected_resume_time: preferred,
      }),
    })
  }

  const takeBreak = async (minutes: number) => {
    if (!session) return
    setSubmitting(true)
    try {
      const resumeAt = new Date(Date.now() + minutes * 60_000).toISOString()
      const result = await pauseCurrent({ reason: 'short_break', resumePreference: 'soon', preferredResumeAt: resumeAt, breakMinutes: minutes })
      setBreakEndsAt(timestamp(result.execution_session.preferred_resume_at) || Date.now() + minutes * 60_000)
      setPauseView('closed')
      toast.success(result.pause_review.requires_plan_adjustment ? 'Break started. HumanOS will check the affected work when you return.' : 'This break fits your current plan.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.pauseFailed'))
    } finally { setSubmitting(false) }
  }

  const resolvedResumeTime = () => {
    const date = new Date()
    if (resumeChoice === 'tonight') {
      date.setHours(19, 0, 0, 0)
      if (date.getTime() <= Date.now()) date.setTime(Date.now() + 60 * 60_000)
      return date.toISOString()
    }
    if (resumeChoice === 'tomorrow') {
      date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0)
      return date.toISOString()
    }
    if (resumeChoice === 'custom') return preferredResumeAt ? new Date(preferredResumeAt).toISOString() : null
    return null
  }

  const continueLater = async () => {
    if (!pauseProgress.trim() || !pauseNextStep.trim()) {
      toast.error('Add where you stopped and the first step for your return.')
      return
    }
    setSubmitting(true)
    try {
      const preferred = resolvedResumeTime()
      const result = await pauseCurrent({ reason: pauseReason, resumePreference: preferred ? 'later_today' : 'unknown', preferredResumeAt: preferred })
      await saveContext(pauseReason, preferred)
      setPauseView('closed')
      toast.success('Your progress is saved. HumanOS is preparing a local calendar diff.')
      await requestExecutionReplan({
        trigger: 'execution_deferred',
        notBefore: preferred,
        resumeInstruction: resumeInstruction.trim() || null,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the pause.')
    } finally { setSubmitting(false) }
  }

  const prepareSwitch = async () => {
    if (!pauseProgress.trim() || !pauseNextStep.trim()) {
      toast.error('Add where you stopped and the first step for your return.')
      return
    }
    setSubmitting(true)
    try {
      await pauseCurrent({ reason: pauseReason, resumePreference: 'unknown' })
      await saveContext(pauseReason, null)
      setPauseView('switch-queue')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the task switch.')
    } finally { setSubmitting(false) }
  }

  const switchToReadyTask = async (target: ExecutionSession) => {
    const needsLocalDiff = Boolean(resumeImpact?.requires_plan_adjustment)
    await startSession(target)
    if (needsLocalDiff && session) {
      await requestExecutionReplan({
        trigger: 'execution_switch',
        affectedTaskIds: [session.task_id, target.task_id],
      })
    }
  }

  const askHumanOS = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const runtimeState = { focus: focusNow, energy: energyNow, stress: stressNow }
      await apiRequest('/api/state-checkins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...runtimeState, daily_checkin: false, source_context: 'interruption_help' }),
      })
      const response = await apiRequest<{ recommendation: InterruptionRecommendation }>('/api/execution-sessions/recommend-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, reason: pauseReason, remaining_minutes: displayRemaining, runtime_state: runtimeState }),
      })
      setRecommendation(response.recommendation)
      setResumeImpact(response.recommendation.impact?.requires_plan_adjustment ? response.recommendation.impact : null)
      setPauseView('recommendation')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'HumanOS could not compare the options.')
    } finally { setSubmitting(false) }
  }

  const recordRecommendationDecision = async (accepted: boolean) => {
    if (!session || !recommendation) return
    await apiRequest('/api/state-transitions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: session.task_id,
        execution_session_id: session.execution_session_id,
        before_state: { execution_status: 'running' },
        action: { type: accepted ? 'accept_interrupt_recommendation' : 'reject_interrupt_recommendation', execution_session_id: session.execution_session_id, recommendation },
        actual_state: { execution_status: accepted ? 'paused' : 'running' },
        outcome: { accepted, source: recommendation.provider || 'unknown' },
      }),
    })
  }

  const acceptRecommendation = async () => {
    if (!recommendation) return
    try { await recordRecommendationDecision(true) } catch { /* Primary action still proceeds. */ }
    if (recommendation.action === 'short_break') {
      await takeBreak(Number(recommendation.break_minutes || 10)); return
    }
    if (recommendation.action === 'switch_task') {
      const target = readyQueue.find((item) => item.task_id === recommendation.selected_task_id)
      setPauseView('switch-context')
      if (target) toast.info(`Save a return cue, then switch to ${target.task_title || 'the recommended task'}.`)
      return
    }
    setPauseView('later')
  }

  const requestExecutionReplan = async (options?: {
    trigger?: 'execution_deferred' | 'execution_switch' | 'interruption_replan'
    notBefore?: string | null
    affectedTaskIds?: string[]
    resumeInstruction?: string | null
  }) => {
    if (!session) return
    setSubmitting(true); setReplanning(true)
    try {
      const accepted = await apiRequest<any>('/api/plans/replan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'local',
          trigger: options?.trigger || 'execution_deferred',
          affected_task_ids: options?.affectedTaskIds || [session.task_id],
          adjustment_constraints: {
            ...(options?.notBefore ? { not_before_by_task: { [session.task_id]: options.notBefore } } : {}),
            ...(options?.resumeInstruction ? { resume_instruction: options.resumeInstruction } : {}),
          },
        }),
      })
      const job = accepted?.data?.replan?.job || accepted?.replan?.job || accepted?.job
      if (!job?.job_id) throw new Error('The backend did not create a replan job.')
      let latest = job
      for (let attempt = 0; attempt < 120 && !['completed', 'failed'].includes(String(latest.status)); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const result = await apiRequest<any>(`/api/background-jobs?job_id=${encodeURIComponent(job.job_id)}`)
        latest = result?.job || result?.data?.job || latest
      }
      if (latest.status !== 'completed') throw new Error(latest.error || 'The local adjustment could not be generated.')
      window.dispatchEvent(new CustomEvent('humanos:plan-revision'))
      toast.success('A local calendar diff is ready. The confirmed calendar has not changed yet.')
      router.push('/app?review=replan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Replan failed')
    } finally { setSubmitting(false); setReplanning(false) }
  }

  const startEndedSessionNow = async () => {
    if (!endedSession) return
    setSubmitting(true)
    try {
      await apiRequest('/api/execution-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: endedSession.task_id,
          execution_session_id: endedSession.execution_session_id,
          request_id: requestId('feedback-not-started'),
          trigger: 'session_elapsed_without_start',
          task_evaluation: {
            completion: 'did_not_start',
            actual_minutes: 0,
            remaining_duration_minutes: Number(endedSession.session_remaining_minutes ?? endedSession.planned_work_minutes ?? 0),
          },
          schedule_action: 'keep_time_free',
        }),
      })
      const ensured = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession }>>('/api/execution-sessions/ensure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: endedSession.task_id }),
      })
      const target = ensured.data.execution_session
      const started = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession }>>('/api/execution-sessions/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: target.execution_session_id, request_id: requestId('start-now') }),
      })
      setEndedSession(null)
      setCompletion(null)
      setCurrent({ mode: 'running', session: started.data.execution_session, task: endedSession.task || task })
      setNow(Date.now())
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'start', executionSession: started.data.execution_session } }))
      toast.success('Task started now. The missed session remains in the execution history.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.startFailed'))
    } finally { setSubmitting(false) }
  }

  const endSession = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const minutes = Math.max(Math.ceil(elapsedSeconds / 60), Number(session.live_active_minutes || 0), Number(session.actual_minutes || 0))
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_session: ExecutionSession }>>('/api/execution-sessions/end', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execution_session_id: session.execution_session_id, actual_minutes: minutes, request_id: requestId('end') }),
      })
      setEndedSession(result.data.execution_session)
      setCurrent({ mode: 'session_ended', session: result.data.execution_session, task })
      setPauseView('closed')
      setBreakEndsAt(null)
      setCompletion(null)
      window.dispatchEvent(new CustomEvent('humanos:execution-updated', { detail: { action: 'end', executionSession: result.data.execution_session } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.endFailed'))
    } finally { setSubmitting(false) }
  }

  const submitFeedback = async (outcome: Completion) => {
    if (!endedSession) return
    if (outcome !== 'completed' && outcome !== 'did_not_start' && (!progress.trim() || !feedbackNextStep.trim())) {
      setCompletion(outcome); return
    }
    setSubmitting(true)
    try {
      const actual = Number(endedSession.live_active_minutes ?? endedSession.actual_minutes ?? 0)
      const result = await apiRequest<{ data: ExecutionFeedbackResult }>('/api/execution-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: endedSession.task_id,
          execution_session_id: endedSession.execution_session_id,
          request_id: requestId('feedback'),
          trigger: 'session_finished',
          task_evaluation: {
            completion: outcome,
            actual_minutes: actual,
            remaining_duration_minutes: outcome === 'completed' ? 0 : Number(endedSession.session_remaining_minutes ?? plannedMinutes),
            progress,
            next_step: feedbackNextStep,
          },
          schedule_action: 'keep_time_free',
        }),
      })
      const savedFeedback = result.data.feedback as (Record<string, unknown> & {
        overrun_minutes?: number
        execution_failure_recorded?: boolean
        replan?: { required?: boolean; job?: { job_id?: string; status?: string; error?: string | null } }
      }) | undefined
      setEndedSession(null); setCompletion(null); setProgress(''); setFeedbackNextStep('')
      window.dispatchEvent(new CustomEvent('humanos:plan-updated', { detail: { source: 'execution-feedback', task: result.data.task } }))
      await loadExecution(false)
      const replan = savedFeedback?.replan
      if (savedFeedback?.execution_failure_recorded && replan?.required && replan.job?.job_id) {
        setReplanning(true)
        let latest = replan.job
        for (let attempt = 0; attempt < 120 && !['completed', 'failed'].includes(String(latest.status)); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          const status = await apiRequest<any>(`/api/background-jobs?job_id=${encodeURIComponent(String(replan.job.job_id))}`)
          latest = status?.job || status?.data?.job || latest
        }
        if (latest.status !== 'completed') throw new Error(latest.error || 'The overrun was recorded, but the local calendar update could not be prepared.')
        window.dispatchEvent(new CustomEvent('humanos:plan-revision'))
        toast.success(`Finished ${Number(savedFeedback.overrun_minutes || 0)} min late. HumanOS recorded the overrun and prepared a local calendar update.`)
        router.push('/app?review=replan')
        return
      }
      if (savedFeedback?.execution_failure_recorded) {
        toast.success(`Finished ${Number(savedFeedback.overrun_minutes || 0)} min late. The overrun was recorded; no downstream work needed to move.`)
      } else {
        toast.success('Session feedback saved. HumanOS did not change your calendar.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.feedbackFailed'))
    } finally { setSubmitting(false); setReplanning(false) }
  }

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>

  const contextFields = (
    <div className="grid gap-3">
      <label className="grid gap-2 text-sm"><span>Why are you pausing?</span>
        <select className="h-11 rounded-xl border bg-background px-3" value={pauseReason} onChange={(event) => setPauseReason(event.target.value)}>
          <option value="tired">Tired</option><option value="stuck">Stuck</option><option value="waiting_for_material">Waiting for material</option><option value="interrupted">Interrupted</option><option value="took_longer">Took longer than expected</option><option value="other">Other</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm"><span>Where did you stop?</span><textarea className="min-h-20 rounded-xl border bg-background p-3" value={pauseProgress} onChange={(event) => setPauseProgress(event.target.value)} placeholder="I finished the outline." /></label>
      <label className="grid gap-2 text-sm"><span>What should you do first when you return?</span><textarea className="min-h-20 rounded-xl border bg-background p-3" value={pauseNextStep} onChange={(event) => setPauseNextStep(event.target.value)} placeholder="Start by writing the introduction." /></label>
    </div>
  )

  return (
    <main className="humanos-operating-page h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-28 pt-6 md:px-8">
      {replanning && <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-6 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl border bg-card p-7 text-center shadow-2xl"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><h2 className="mt-4 text-lg font-semibold">Preparing a local adjustment</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Only affected future slots are being reconsidered. Executed work and protected events stay fixed.</p></div></div>}
      <div className="humanos-operating-container mx-auto max-w-5xl space-y-6">
        <header>
          <Link href="/app" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Workspace</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Focus</p>
          <div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Focus session</h1><p className="mt-2 text-muted-foreground">The backend clock keeps tracking while this tab is hidden.</p></div><span className="rounded-full border bg-background/70 px-4 py-1.5 text-sm">{statusLabel}</span></div>
        </header>

        {endedSession ? (
          <Card className="border-primary/30">
            <CardHeader><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Session ended</p><CardTitle className="text-2xl">{title}</CardTitle><CardDescription>{formatPlannedTime(endedSession)} · {Number(endedSession.live_active_minutes ?? endedSession.actual_minutes ?? 0)} min tracked automatically</CardDescription></CardHeader>
            <CardContent className="space-y-5"><h3 className="text-lg font-semibold">How did it go?</h3>
              {!completion && <div className="grid gap-3 sm:grid-cols-3">
                {Number(endedSession.live_active_minutes ?? endedSession.actual_minutes ?? 0) > 0 ? <>
                  <Button className="h-auto min-h-20 whitespace-normal" variant="outline" onClick={() => void submitFeedback('completed')}>Finished the whole task</Button>
                  <Button className="h-auto min-h-20 whitespace-normal" variant="outline" onClick={() => setCompletion('some_progress')}>Made progress</Button>
                  <Button className="h-auto min-h-20 whitespace-normal" variant="outline" onClick={() => setCompletion('no_progress')}>Worked, no progress</Button>
                </> : <>
                  <Button variant="outline" onClick={() => void submitFeedback('did_not_start')}>Did not start</Button>
                  <Button onClick={() => void startEndedSessionNow()} disabled={submitting}>Start now</Button>
                </>}
              </div>}
              {(completion === 'some_progress' || completion === 'no_progress') && <div className="rounded-2xl border bg-muted/30 p-5"><div className="grid gap-3"><label className="grid gap-2 text-sm"><span>{completion === 'some_progress' ? 'Where did you get to?' : 'What stopped progress?'}</span><textarea className="min-h-20 rounded-xl border bg-background p-3" value={progress} onChange={(event) => setProgress(event.target.value)} /></label><label className="grid gap-2 text-sm"><span>What is the first step next time?</span><textarea className="min-h-20 rounded-xl border bg-background p-3" value={feedbackNextStep} onChange={(event) => setFeedbackNextStep(event.target.value)} /></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setCompletion(null)}>Back</Button><Button onClick={() => void submitFeedback(completion)} disabled={submitting || !progress.trim() || !feedbackNextStep.trim()}><CheckCircle2 className="mr-2 h-4 w-4" />Save feedback</Button></div></div>}
            </CardContent>
          </Card>
        ) : session ? (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="overflow-hidden border-primary/30"><CardHeader className="bg-primary/5"><CardDescription>{statusLabel}</CardDescription><CardTitle className="text-2xl md:text-4xl">{title}</CardTitle></CardHeader><CardContent className="space-y-6 pt-6">
              {breakEndsAt && current?.mode === 'paused' ? <div className="rounded-3xl border bg-primary/5 p-7 text-center"><Coffee className="mx-auto h-8 w-8 text-primary" /><p className="mt-4 font-mono text-5xl font-semibold">{durationLabel(breakRemainingSeconds)}</p><p className="mt-2 text-sm text-muted-foreground">Break remaining</p>{breakRemainingSeconds === 0 && <div className="mt-5 flex flex-wrap justify-center gap-2">{resumeImpact?.requires_plan_adjustment && resumeImpact.capacity_status !== 'insufficient' ? <><Button onClick={() => { setBreakEndsAt(null); void requestExecutionReplan({ trigger: 'interruption_replan', notBefore: new Date().toISOString() }) }} disabled={submitting}>Continue and adjust the next task</Button><Button variant="outline" onClick={() => { const afterNext = resumeImpact.affected_sessions?.[0]?.planned_end_at || null; setBreakEndsAt(null); void requestExecutionReplan({ trigger: 'execution_deferred', notBefore: afterNext }) }} disabled={submitting}>Keep the next task; schedule this remainder later</Button><Button variant="outline" onClick={() => { setBreakEndsAt(null); setPauseView('later') }}>Continue this task later</Button></> : <><Button onClick={() => void startSession(session)} disabled={submitting}>Resume task</Button><Button variant="outline" onClick={() => { setBreakEndsAt(null); setPauseView('help') }}>I’m not ready</Button></>}</div>}</div> : <div className="rounded-2xl border bg-background p-6 text-center"><p className="font-mono text-5xl font-semibold tracking-tight md:text-7xl">{durationLabel(elapsedSeconds)}</p><p className="mt-2 text-sm text-muted-foreground">Active time tracked by the backend clock</p></div>}
              <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Planned</p><p className="mt-1 text-xl font-semibold">{plannedMinutes} min</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Remaining</p><p className="mt-1 text-xl font-semibold">{displayRemaining} min</p></div></div>

              {pauseView === 'menu' && <div className="rounded-2xl border bg-muted/30 p-5"><h3 className="text-lg font-semibold">What do you need right now?</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Button className="h-auto min-h-20 justify-start whitespace-normal p-4" variant="outline" onClick={() => setPauseView('break')}><Coffee className="mr-3 h-5 w-5" />Take a short break</Button><Button className="h-auto min-h-20 justify-start whitespace-normal p-4" variant="outline" onClick={() => setPauseView('later')}><CalendarClock className="mr-3 h-5 w-5" />Continue this task later</Button><Button className="h-auto min-h-20 justify-start whitespace-normal p-4" variant="outline" onClick={() => setPauseView('switch-context')}><Shuffle className="mr-3 h-5 w-5" />Switch to another task</Button><Button className="h-auto min-h-20 justify-start whitespace-normal p-4" variant="outline" onClick={() => setPauseView('help')}><HelpCircle className="mr-3 h-5 w-5" />Help me decide</Button></div><Button className="mt-3" variant="ghost" onClick={() => void startSession(session, true)}>Resume task</Button></div>}
              {pauseView === 'break' && <div className="rounded-2xl border bg-muted/30 p-5"><h3 className="font-semibold">How long would you like to pause?</h3><p className="mt-1 text-sm text-muted-foreground">No reason or context dump is needed for a short break.</p><div className="mt-4 flex flex-wrap gap-2">{[5, 10, 15].map((minutes) => <Button key={minutes} variant="outline" onClick={() => void takeBreak(minutes)} disabled={submitting}>{minutes} min</Button>)}<input className="h-10 w-24 rounded-full border bg-background px-4" type="number" min={1} max={120} value={customBreakMinutes} onChange={(event) => setCustomBreakMinutes(Number(event.target.value))} /><Button onClick={() => void takeBreak(customBreakMinutes)} disabled={submitting}>Start custom break</Button></div><Button className="mt-3" variant="ghost" onClick={() => setPauseView('menu')}>Back</Button></div>}
              {pauseView === 'later' && <div className="rounded-2xl border bg-muted/30 p-5"><h3 className="font-semibold">Continue this task later</h3><div className="mt-4">{contextFields}</div><p className="mt-5 text-sm font-medium">When would you like to continue?</p><div className="mt-2 grid gap-2 sm:grid-cols-4">{(['tonight', 'tomorrow', 'custom', 'recommend'] as const).map((value) => <button key={value} className={`rounded-xl border px-3 py-2 text-sm capitalize ${resumeChoice === value ? 'border-primary bg-primary/10' : 'bg-background'}`} onClick={() => setResumeChoice(value)}>{value === 'recommend' ? 'HumanOS recommends' : value}</button>)}</div>{resumeChoice === 'custom' && <input type="datetime-local" className="mt-3 w-full rounded-xl border bg-background px-3 py-2" value={preferredResumeAt} onChange={(event) => setPreferredResumeAt(event.target.value)} />}<label className="mt-4 grid gap-2 text-sm"><span>Anything HumanOS must protect?</span><textarea className="min-h-20 rounded-xl border bg-background p-3" value={resumeInstruction} onChange={(event) => setResumeInstruction(event.target.value)} placeholder="Move it to tonight, but don’t move my English class." /></label><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPauseView('menu')}>Back</Button><Button onClick={() => void continueLater()} disabled={submitting}>Save pause</Button></div></div>}
              {pauseView === 'switch-context' && <div className="rounded-2xl border bg-muted/30 p-5"><h3 className="font-semibold">Before switching, leave a return cue</h3><div className="mt-4">{contextFields}</div><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPauseView('menu')}>Back</Button><Button onClick={() => void prepareSwitch()} disabled={submitting}>Show ready tasks</Button></div></div>}
              {pauseView === 'switch-queue' && <div className="rounded-2xl border bg-muted/30 p-5"><h3 className="font-semibold">Choose from the Ready Queue</h3><p className="mt-1 text-sm text-muted-foreground">Selecting a task starts it immediately. HumanOS only drafts a local calendar change if later sessions are affected.</p><div className="mt-4 space-y-2">{readyQueue.length ? readyQueue.slice(0, 6).map((item) => <button className="flex w-full items-center justify-between rounded-xl border bg-background p-4 text-left hover:border-primary" key={item.execution_session_id} onClick={() => void switchToReadyTask(item)}><span><strong>{item.task_title || item.title || 'Ready task'}</strong><small className="mt-1 block text-muted-foreground">{item.session_remaining_minutes ?? item.planned_work_minutes} min · {formatPlannedTime(item)}</small></span><Play className="h-4 w-4" /></button>) : <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">No other task is Ready.</p>}</div></div>}
              {pauseView === 'help' && <div className="rounded-2xl border bg-muted/30 p-5"><h3 className="font-semibold">Help HumanOS compare the options</h3><label className="mt-4 grid gap-2 text-sm"><span>What is making it hard to continue?</span><select className="h-11 rounded-xl border bg-background px-3" value={pauseReason} onChange={(event) => setPauseReason(event.target.value)}><option value="tired">Tired</option><option value="stuck">Stuck</option><option value="waiting_for_material">Waiting for material</option><option value="interrupted">Interrupted</option><option value="took_longer">Took longer than expected</option></select></label><div className="mt-4 grid gap-4 sm:grid-cols-3">{[['Focus', focusNow, setFocusNow], ['Energy', energyNow, setEnergyNow], ['Stress', stressNow, setStressNow]].map(([label, value, setter]) => <label className="grid gap-2 text-sm" key={String(label)}><span>{String(label)} {Number(value)}/7</span><input type="range" min={1} max={7} value={Number(value)} onChange={(event) => (setter as (next: number) => void)(Number(event.target.value))} /></label>)}</div><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPauseView('menu')}>Back</Button><Button onClick={() => void askHumanOS()} disabled={submitting}>Get one recommendation</Button></div></div>}
              {pauseView === 'recommendation' && recommendation && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">HumanOS recommends</p><h3 className="mt-2 text-lg font-semibold">{recommendation.action === 'short_break' ? `Take a ${recommendation.break_minutes || 10}-minute break` : recommendation.action === 'switch_task' ? 'Switch to a ready task' : 'Continue this task later'}</h3><p className="mt-2 text-sm leading-6">{recommendation.explanation}</p>{recommendation.deadline_warning && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">There may not be enough capacity before the deadline. You can add available time or keep the current constraints and accept that some work may remain unscheduled.</div>}<div className="mt-4 flex gap-2"><Button onClick={() => void acceptRecommendation()} disabled={submitting}>Accept suggestion</Button><Button variant="outline" onClick={() => { void recordRecommendationDecision(false); setPauseView('menu') }}>Choose something else</Button></div></div>}

              {resumeImpact && pauseView === 'closed' && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h3 className="font-semibold">A later session may be affected</h3>{resumeImpact.affected_sessions?.length ? <p className="mt-2 text-sm">{resumeImpact.affected_sessions[0].task_title || 'The next task'} at {resumeImpact.affected_sessions[0].planned_start_at ? new Date(resumeImpact.affected_sessions[0].planned_start_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'its planned time'} may need to move.</p> : <p className="mt-2 text-sm">The remaining work may not fit before its deadline.</p>}<div className="mt-4 flex flex-wrap gap-2">{resumeImpact.capacity_status === 'insufficient' ? <><Button onClick={() => router.push('/app/plan/setup')}>Add available time</Button><Button variant="outline" onClick={() => setResumeImpact(null)}>Keep constraints</Button></> : <><Button onClick={() => void requestExecutionReplan()} disabled={submitting}>Review local adjustment</Button><Button variant="outline" onClick={() => setResumeImpact(null)}>Keep current plan</Button></>}</div></div>}

              {pauseView === 'closed' && <div className="flex flex-wrap justify-center gap-3">{current?.mode === 'running' ? <><Button variant="outline" onClick={() => void beginPause()} disabled={submitting}><Pause className="mr-2 h-4 w-4" />Pause</Button><Button onClick={() => void endSession()} disabled={submitting}><Square className="mr-2 h-4 w-4" />Finish session</Button></> : !breakEndsAt && <><Button onClick={() => void startSession()} disabled={submitting}><Play className="mr-2 h-4 w-4" />Resume task</Button><Button variant="outline" onClick={() => void endSession()} disabled={submitting}><Square className="mr-2 h-4 w-4" />Finish session</Button></>}</div>}
            </CardContent></Card>
            <div className="space-y-4"><Card><CardHeader><CardTitle className="text-lg">Return cue</CardTitle></CardHeader><CardContent className="text-sm"><p>{String((task?.contextWindow || {}).nextStep || task?.context || 'Start with the smallest concrete next step.')}</p></CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Session</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{formatPlannedTime(session)}</p><p className="flex items-center gap-2"><TimerReset className="h-4 w-4" />{plannedMinutes} min planned</p></CardContent></Card></div>
          </div>
        ) : <Card className="py-12 text-center"><CardContent><Clock3 className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-xl font-semibold">No session is ready</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Open your confirmed plan to choose what to work on next.</p><Button className="mt-5" asChild><Link href="/app/plan">Open plan</Link></Button></CardContent></Card>}
      </div>
    </main>
  )
}
