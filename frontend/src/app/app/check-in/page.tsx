'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, BatteryMedium, Brain, CheckCircle2, CornerDownRight, Gauge, Loader2, PauseCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/client/api'
import type { CheckInResourceEnvelope, ContextDump, DailyPlanReview, HelpDecideRecommendation, ReentryResult, RuntimeState, TaskLifecycleResourceEnvelope } from '@/lib/contracts/checkin-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

type Mode = 'daily' | 'interruption'

export default function CheckInPage() {
  const { t, locale } = useTranslation()
  const params = useSearchParams()
  const mode: Mode = params.get('mode') === 'interruption' ? 'interruption' : 'daily'
  const decisionSource = params.get('source') || ''
  const helpDecide = decisionSource === 'help-decide' || decisionSource === 'break-not-ready'
  const taskId = params.get('task_id') || ''
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reentry, setReentry] = useState<ReentryResult | null>(null)
  const [dailyReview, setDailyReview] = useState<DailyPlanReview | null>(null)
  const [decision, setDecision] = useState<HelpDecideRecommendation | null>(null)
  const [focus, setFocus] = useState(5)
  const [energy, setEnergy] = useState(5)
  const [stress, setStress] = useState(3)
  const [mood, setMood] = useState('neutral')
  const [readiness, setReadiness] = useState('ready')
  const [attentionResidue, setAttentionResidue] = useState('')
  const [dailyNote, setDailyNote] = useState('')
  const [progress, setProgress] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [remainingMinutes, setRemainingMinutes] = useState(30)
  const [nextAction, setNextAction] = useState('')
  const [openQuestions, setOpenQuestions] = useState('')
  const [stopReason, setStopReason] = useState('interrupted')
  const [decisionReason, setDecisionReason] = useState(decisionSource === 'break-not-ready' ? 'still_not_ready_after_break' : 'tired')
  const [decisionResumeAt, setDecisionResumeAt] = useState('')
  const [resumeTimeCheck, setResumeTimeCheck] = useState<{ valid: boolean; conflicts: Array<{ type: string; [key: string]: unknown }>; alternatives: string[] } | null>(null)

  const runtimeState: RuntimeState = useMemo(() => ({ focus, energy, stress, mood, readiness }), [focus, energy, stress, mood, readiness])

  const saveDailyCheckIn = async () => {
    setSubmitting(true)
    try {
      const result = await apiRequest<CheckInResourceEnvelope<{ runtime_state: RuntimeState; daily_plan_review: DailyPlanReview | null }>>('/api/state-checkins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...runtimeState,
          attention_residue: attentionResidue,
          daily_note: dailyNote,
          daily_checkin: true,
        }),
      })
      setDailyReview(result.data.daily_plan_review)
      setSaved(true)
      toast(t('checkin.saved'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('checkin.saveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const requestDecision = async () => {
    if (!taskId) return toast(t('checkin.missingTask'))
    setSubmitting(true)
    try {
      const result = await apiRequest<{ data: HelpDecideRecommendation }>('/api/execution/recommendations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, reason: decisionReason, locale, runtime_state: runtimeState }),
      })
      setDecision(result.data)
    } catch (error) { toast(error instanceof Error ? error.message : t('checkin.saveFailed')) }
    finally { setSubmitting(false) }
  }

  const recordDecision = async (accepted: boolean) => {
    if (!decision) return
    const action = decision.recommendation.action
    if (accepted && action === 'continue_later' && !decisionResumeAt) {
      toast(locale === 'zh' ? '请选择恢复时间' : 'Choose a resume time')
      return
    }
    if (accepted && action === 'continue_later' && !resumeTimeCheck?.valid) {
      toast(locale === 'zh' ? '请先检查并选择一个可用的恢复时间' : 'Check and choose an available resume time first')
      return
    }
    if (accepted && ['continue_later', 'switch_task'].includes(action) && (!progress.trim() || !nextAction.trim())) {
      toast(locale === 'zh' ? '请先保存当前进展和回来后的第一步' : 'Save your progress and first step before leaving this task')
      return
    }
    setSubmitting(true)
    try {
      const endpoint = accepted ? '/api/execution/recommendations/apply' : '/api/execution/recommendations/feedback'
      await apiRequest(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: decision.id, task_id: taskId, reason: decisionReason, locale, preferred_resume_at: decisionResumeAt || undefined, progress, progress_percent: progressPercent, task_remaining_minutes: remainingMinutes, next_action: nextAction, open_questions: openQuestions, recommendation: decision.recommendation, accepted, recommended_action: action, selected_action: accepted ? action : 'user_choice' }),
      })
      toast(accepted ? (locale === 'zh' ? '建议已执行' : 'Recommendation applied') : (locale === 'zh' ? '选择已记录' : 'Choice recorded'))
      window.location.assign(accepted && action === 'continue_later' ? `/app/plan?adjust=continue-later&task_id=${encodeURIComponent(taskId)}` : '/app/focus')
    } catch (error) { toast(error instanceof Error ? error.message : t('checkin.saveFailed')) }
    finally { setSubmitting(false) }
  }

  const checkResumeTime = async (value = decisionResumeAt) => {
    if (!value) return
    setSubmitting(true)
    try {
      const result = await apiRequest<{ data: { valid: boolean; conflicts: Array<{ type: string; [key: string]: unknown }>; alternatives: string[] } }>('/api/execution/recommendations/resume-time-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, preferred_resume_at: new Date(value).toISOString(), remaining_duration_minutes: remainingMinutes }),
      })
      setResumeTimeCheck(result.data)
    } catch (error) { toast(error instanceof Error ? error.message : t('checkin.saveFailed')) }
    finally { setSubmitting(false) }
  }

  const saveInterruption = async () => {
    if (!taskId) {
      toast(t('checkin.missingTask'))
      return
    }
    if (!nextAction.trim()) {
      toast(t('checkin.nextActionRequired'))
      return
    }
    setSubmitting(true)
    try {
      const result = await apiRequest<TaskLifecycleResourceEnvelope<{ context_dump: ContextDump }>>('/api/context-dumps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          progress,
          progress_percent: progressPercent,
          task_remaining_minutes: remainingMinutes,
          next_action: nextAction,
          open_questions: openQuestions,
          stop_reason: stopReason,
          materials: [],
        }),
      })
      setSaved(true)
      toast(t('checkin.contextSaved'))
      return result.data.context_dump
    } catch (error) {
      toast(error instanceof Error ? error.message : t('checkin.contextFailed'))
      return null
    } finally {
      setSubmitting(false)
    }
  }

  const generateReentry = async () => {
    setSubmitting(true)
    try {
      if (!saved) {
        const dump = await saveInterruption()
        if (!dump) return
      }
      const result = await apiRequest<TaskLifecycleResourceEnvelope<{ reentry: ReentryResult }>>('/api/reentry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, runtime_state: runtimeState }),
      })
      setReentry(result.data.reentry)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('checkin.reentryFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const slider = (label: string, value: number, setter: (value: number) => void, icon: React.ReactNode) => (
    <label className="block select-none rounded-2xl border bg-background/70 p-4">
      <span className="mb-2 flex items-center justify-between text-sm font-medium"><span className="flex items-center gap-2">{icon}{label}</span><strong className="min-w-10 rounded-full bg-primary/10 px-2 py-1 text-center text-primary">{value}/7</strong></span>
      <input
        aria-label={label}
        className="h-10 w-full cursor-grab touch-pan-y appearance-none bg-transparent active:cursor-grabbing [&::-moz-range-progress]:h-2 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        type="range"
        min={1}
        max={7}
        step={1}
        value={value}
        onInput={(event) => setter(Number(event.currentTarget.value))}
        onChange={(event) => setter(Number(event.currentTarget.value))}
      />
      <span className="flex justify-between px-1 text-[11px] text-muted-foreground"><span>1</span><span>4</span><span>7</span></span>
    </label>
  )

  return (
    <main className="humanos-operating-page h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-28 pt-6 md:px-8">
      <div className="humanos-operating-container mx-auto max-w-6xl space-y-6">
        <header>
          <Link href={mode === 'interruption' ? '/app/focus' : '/app'} className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('checkin.back')}</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / {mode === 'daily' ? 'Check-in' : 'Context Dump'}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{t(`checkin.${mode}Title`)}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t(`checkin.${mode}Subtitle`)}</p>
        </header>

        {mode === 'daily' && helpDecide ? (
          <Card>
            <CardHeader><CardTitle>{locale === 'zh' ? '让 HumanOS 帮你决定下一步' : 'Let HumanOS recommend the next step'}</CardTitle><CardDescription>{locale === 'zh' ? '说明为什么难以继续，再提供此刻状态。建议不会在你确认前修改计划。' : 'Tell us why continuing is difficult and report your current state. Nothing changes until you confirm.'}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <label className="grid gap-2 text-sm"><span>{locale === 'zh' ? '现在为什么难以继续？' : 'Why is it difficult to continue?'}</span><select className="h-10 rounded-md border bg-background px-3" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)}>{decisionSource === 'break-not-ready' && <option value="still_not_ready_after_break">{locale === 'zh' ? '休息后仍未准备好' : 'Still not ready after the break'}</option>}<option value="tired">{locale === 'zh' ? '疲劳' : 'Tired'}</option><option value="blocked">{locale === 'zh' ? '卡住了' : 'Stuck'}</option><option value="waiting_material">{locale === 'zh' ? '等待材料' : 'Waiting for material'}</option><option value="interrupted">{locale === 'zh' ? '被打断' : 'Interrupted'}</option><option value="took_longer">{locale === 'zh' ? '任务比预计更久' : 'Took longer than expected'}</option></select></label>
              <div className="grid gap-3 md:grid-cols-3">{slider(t('checkin.focus'), focus, setFocus, <Brain className="h-4 w-4" />)}{slider(t('checkin.energy'), energy, setEnergy, <BatteryMedium className="h-4 w-4" />)}{slider(t('checkin.stress'), stress, setStress, <Gauge className="h-4 w-4" />)}</div>
              {!decision ? <Button className="w-full" onClick={requestDecision} disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{locale === 'zh' ? '生成一个具体建议' : 'Generate one recommendation'}</Button> : <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{locale === 'zh' ? 'HumanOS 建议' : 'HumanOS recommendation'}</h3><span className="rounded-full bg-background px-2 py-1 text-xs">{decision.provider === 'deepseek' ? 'AI + Python' : 'Python fallback'}</span></div><p className="mt-3 text-lg font-medium">{decision.recommendation.action === 'short_break' ? (locale === 'zh' ? `休息 ${decision.recommendation.break_minutes} 分钟` : `Take a ${decision.recommendation.break_minutes}-minute break`) : decision.recommendation.action === 'continue_current' ? (locale === 'zh' ? `继续当前任务 ${decision.recommendation.duration_minutes} 分钟` : `Continue for ${decision.recommendation.duration_minutes} minutes`) : decision.recommendation.action === 'switch_task' ? (locale === 'zh' ? `切换到 ${decision.recommendation.target_task_title || '下一项任务'}` : `Switch to ${decision.recommendation.target_task_title || 'the next task'}`) : (locale === 'zh' ? '晚些时候继续当前任务' : 'Continue this task later')}</p><p className="mt-2 text-sm text-muted-foreground">{decision.recommendation.reason}</p>{['continue_later', 'switch_task'].includes(decision.recommendation.action) && <div className="mt-4 grid gap-3 rounded-xl border bg-background p-4"><p className="text-sm font-semibold">{locale === 'zh' ? '离开前保存任务上下文' : 'Save context before leaving'}</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span>{locale === 'zh' ? '完成百分比' : 'Progress completed'}</span><div className="flex items-center gap-3"><input type="range" min={0} max={100} step={5} value={progressPercent} onChange={(event) => setProgressPercent(Number(event.target.value))} className="w-full" /><strong className="min-w-12 text-right">{progressPercent}%</strong></div></label><label className="grid gap-1 text-sm"><span>{locale === 'zh' ? '预计剩余分钟' : 'Estimated minutes remaining'}</span><Input type="number" min={0} step={5} value={remainingMinutes} onChange={(event) => { setRemainingMinutes(Math.max(Number(event.target.value), 0)); setResumeTimeCheck(null) }} /></label></div><label className="grid gap-1 text-sm"><span>{locale === 'zh' ? '你停在了哪里？' : 'Where did you stop?'}</span><textarea value={progress} onChange={(event) => setProgress(event.target.value)} className="min-h-16 rounded-md border bg-background p-3" /></label><label className="grid gap-1 text-sm"><span>{locale === 'zh' ? '回来后的第一步' : 'First step when you return'}</span><textarea value={nextAction} onChange={(event) => setNextAction(event.target.value)} className="min-h-16 rounded-md border bg-background p-3" /></label><label className="grid gap-1 text-sm"><span>{locale === 'zh' ? '未解决问题（可选）' : 'Open questions (optional)'}</span><Input value={openQuestions} onChange={(event) => setOpenQuestions(event.target.value)} /></label></div>}{decision.recommendation.action === 'continue_later' && <div className="mt-4 grid gap-3"><label className="grid gap-2 text-sm"><span>{locale === 'zh' ? '希望什么时候恢复？' : 'When would you like to resume?'}</span><div className="flex gap-2"><input type="datetime-local" value={decisionResumeAt} onChange={(event) => { setDecisionResumeAt(event.target.value); setResumeTimeCheck(null) }} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3" /><Button type="button" variant="outline" onClick={() => void checkResumeTime()} disabled={!decisionResumeAt || submitting}>{locale === 'zh' ? '检查时间' : 'Check time'}</Button></div></label>{resumeTimeCheck?.valid && <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800">{locale === 'zh' ? '这个时间在可用窗口内，且没有与其他 Session 冲突。' : 'This time is available and does not conflict with another session.'}</p>}{resumeTimeCheck && !resumeTimeCheck.valid && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-medium">{locale === 'zh' ? '这个时间无法安排' : 'This time cannot be scheduled'}</p><div className="mt-2 space-y-1 text-xs">{resumeTimeCheck.conflicts.map((conflict, index) => <p key={index}>{conflict.type === 'outside_available_window' ? (locale === 'zh' ? '不在个人画像设定的可用时间内。' : 'Outside your Profile availability.') : conflict.type === 'session_overlap' ? (locale === 'zh' ? '与另一个已安排任务冲突。' : 'Overlaps another scheduled task.') : (locale === 'zh' ? '不在当前周内。' : 'Outside the current week.')}</p>)}</div>{resumeTimeCheck.alternatives.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{resumeTimeCheck.alternatives.map((alternative) => <Button key={alternative} size="sm" variant="outline" onClick={() => { const local = new Date(alternative); const value = new Date(local.getTime() - local.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); setDecisionResumeAt(value); setResumeTimeCheck(null); void checkResumeTime(value) }}>{new Date(alternative).toLocaleString()}</Button>)}</div>}</div>}</div>}<p className="mt-3 text-xs text-muted-foreground">{locale === 'zh' ? '已通过 Python 执行策略校验；涉及日历变化时仍需在调整草案中确认。' : 'Validated by the Python execution policy. Calendar changes still require confirmation in the adjustment draft.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void recordDecision(true)} disabled={submitting}>{locale === 'zh' ? '接受建议' : 'Accept'}</Button><Button variant="outline" onClick={() => void recordDecision(false)} disabled={submitting}>{locale === 'zh' ? '我自己选择' : 'Choose myself'}</Button><Button variant="ghost" onClick={() => setDecision(null)}>{locale === 'zh' ? '重新建议' : 'Try again'}</Button></div></div>}
            </CardContent>
          </Card>
        ) : mode === 'daily' ? (
          <Card>
            <CardHeader><CardTitle>{t('checkin.currentState')}</CardTitle><CardDescription>{t('checkin.currentStateDescription')}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">{slider(t('checkin.focus'), focus, setFocus, <Brain className="h-4 w-4" />)}{slider(t('checkin.energy'), energy, setEnergy, <BatteryMedium className="h-4 w-4" />)}{slider(t('checkin.stress'), stress, setStress, <Gauge className="h-4 w-4" />)}</div>
              <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1.5 text-sm"><span>{t('checkin.mood')}</span><select className="h-10 rounded-md border bg-background px-3" value={mood} onChange={(event) => setMood(event.target.value)}><option value="positive">{t('checkin.positive')}</option><option value="neutral">{t('checkin.neutral')}</option><option value="low">{t('checkin.low')}</option><option value="anxious">{t('checkin.anxious')}</option></select></label><label className="grid gap-1.5 text-sm"><span>{t('checkin.readiness')}</span><select className="h-10 rounded-md border bg-background px-3" value={readiness} onChange={(event) => setReadiness(event.target.value)}><option value="ready">{t('checkin.ready')}</option><option value="unsure">{t('checkin.unsure')}</option><option value="need_rest">{t('checkin.needRest')}</option></select></label></div>
              <label className="grid gap-1.5 text-sm"><span>{t('checkin.attentionResidue')}</span><Input value={attentionResidue} onChange={(event) => setAttentionResidue(event.target.value)} placeholder={t('checkin.attentionResiduePlaceholder')} /></label>
              <label className="grid gap-1.5 text-sm"><span>{t('checkin.dailyNote')}</span><textarea className="min-h-28 rounded-md border bg-background p-3 text-sm" value={dailyNote} onChange={(event) => setDailyNote(event.target.value)} placeholder={t('checkin.dailyNotePlaceholder')} /></label>
              {saved ? <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-700"><span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{t('checkin.saved')}</span><Button asChild size="sm"><Link href="/app">{t('checkin.openWorkspace')}</Link></Button></div> : <Button className="w-full" onClick={saveDailyCheckIn} disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('checkin.saveState')}</Button>}
              {dailyReview?.requires_plan_adjustment && dailyReview.first_session && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h3 className="font-semibold">{locale === 'zh' ? '今天的第一个任务需要复核' : 'Your first session needs review'}</h3><p className="mt-2 text-sm"><strong>{dailyReview.first_session.task_title || dailyReview.first_session.task_id}</strong>{locale === 'zh' ? ` 原计划于 ${dailyReview.first_session.planned_start_at ? new Date(dailyReview.first_session.planned_start_at).toLocaleTimeString() : '—'} 开始。` : ` was planned for ${dailyReview.first_session.planned_start_at ? new Date(dailyReview.first_session.planned_start_at).toLocaleTimeString() : '—'}.`}</p>{dailyReview.recommendation && <p className="mt-2 text-sm">{locale === 'zh' ? `建议从 ${new Date(dailyReview.recommendation.start_at).toLocaleTimeString()} 开始，首段调整为 ${dailyReview.recommendation.duration_minutes} 分钟。` : `Suggested start: ${new Date(dailyReview.recommendation.start_at).toLocaleTimeString()}, with a ${dailyReview.recommendation.duration_minutes}-minute first session.`}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" asChild><Link href="/app/plan?adjust=daily-checkin">{locale === 'zh' ? '生成调整计划' : 'Generate adjustment'}</Link></Button><Button size="sm" variant="secondary" asChild><Link href="/app/plan?adjust=manual">{locale === 'zh' ? '我自己修改' : 'Edit manually'}</Link></Button><Button size="sm" variant="ghost" onClick={() => setDailyReview(null)}>{locale === 'zh' ? '保持原计划' : 'Keep current plan'}</Button></div></div>}
              {saved && dailyReview && !dailyReview.requires_plan_adjustment && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">{locale === 'zh' ? '当前状态不需要调整计划。今天第一个未开始 Session 将保持原安排。' : 'No plan adjustment is needed. Today’s first unstarted session will stay as planned.'}</div>}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader><CardTitle>{t('checkin.leaveBreadcrumbs')}</CardTitle><CardDescription>{t('checkin.leaveBreadcrumbsDescription')}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {!taskId && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t('checkin.missingTask')}</p>}
                <label className="grid gap-1.5 text-sm"><span>{t('checkin.progress')}</span><textarea className="min-h-24 rounded-md border bg-background p-3" value={progress} onChange={(event) => setProgress(event.target.value)} /></label>
                <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1.5 text-sm"><span>{t('checkin.progressPercent')}</span><Input type="number" min={0} max={100} value={progressPercent} onChange={(event) => setProgressPercent(Number(event.target.value))} /></label><label className="grid gap-1.5 text-sm"><span>{t('checkin.remainingMinutes')}</span><Input type="number" min={0} value={remainingMinutes} onChange={(event) => setRemainingMinutes(Number(event.target.value))} /></label></div>
                <label className="grid gap-1.5 text-sm"><span>{t('checkin.nextAction')}</span><Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder={t('checkin.nextActionPlaceholder')} /></label>
                <label className="grid gap-1.5 text-sm"><span>{t('checkin.openQuestions')}</span><textarea className="min-h-20 rounded-md border bg-background p-3" value={openQuestions} onChange={(event) => setOpenQuestions(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm"><span>{t('checkin.stopReason')}</span><select className="h-10 rounded-md border bg-background px-3" value={stopReason} onChange={(event) => setStopReason(event.target.value)}><option value="interrupted">{t('checkin.interrupted')}</option><option value="fatigue">{t('checkin.fatigue')}</option><option value="blocked">{t('checkin.blocked')}</option><option value="context_switch">{t('checkin.contextSwitch')}</option><option value="external_event">{t('checkin.externalEvent')}</option></select></label>
                <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={saveInterruption} disabled={submitting || saved}><PauseCircle className="mr-2 h-4 w-4" />{saved ? t('checkin.contextSaved') : t('checkin.saveContext')}</Button><Button onClick={generateReentry} disabled={submitting || !taskId}><RotateCcw className="mr-2 h-4 w-4" />{t('checkin.generateReentry')}</Button></div>
              </CardContent>
            </Card>
            <Card className={reentry ? 'border-primary/40 bg-primary/5' : ''}>
              <CardHeader><CardTitle>{t('checkin.reentryTitle')}</CardTitle><CardDescription>{t('checkin.reentryDescription')}</CardDescription></CardHeader>
              <CardContent>{reentry ? <div className="space-y-4"><div className="rounded-xl bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('checkin.firstStep')}</p><p className="mt-2 text-lg font-medium">{reentry.first_step || nextAction}</p></div>{reentry.previous_progress && <div><p className="text-xs text-muted-foreground">{t('checkin.savedProgress')}</p><p className="mt-1 text-sm">{reentry.previous_progress}</p></div>}<p className="text-sm text-muted-foreground">{t('checkin.remaining')}: {reentry.task_remaining_minutes ?? reentry.remaining_duration_minutes ?? remainingMinutes} min</p><Button className="w-full" asChild><Link href="/app/focus"><CornerDownRight className="mr-2 h-4 w-4" />{t('checkin.returnToFocus')}</Link></Button></div> : <p className="text-sm text-muted-foreground">{t('checkin.reentryEmpty')}</p>}</CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
