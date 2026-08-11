'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, BatteryMedium, Brain, CheckCircle2, CornerDownRight, Gauge, Loader2, PauseCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/client/api'
import type { CheckInResourceEnvelope, ContextDump, DailyPlanReview, ReentryResult, RuntimeState, TaskLifecycleResourceEnvelope } from '@/lib/contracts/checkin-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

type Mode = 'daily' | 'interruption'

export default function CheckInPage() {
  const { t, locale } = useTranslation()
  const params = useSearchParams()
  const mode: Mode = params.get('mode') === 'interruption' ? 'interruption' : 'daily'
  const taskId = params.get('task_id') || ''
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reentry, setReentry] = useState<ReentryResult | null>(null)
  const [dailyReview, setDailyReview] = useState<DailyPlanReview | null>(null)
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
          local_date: new Date().toLocaleDateString('en-CA'),
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
          remaining_duration_minutes: remainingMinutes,
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
    <label className="rounded-2xl border bg-background/70 p-4">
      <span className="mb-3 flex items-center justify-between text-sm font-medium"><span className="flex items-center gap-2">{icon}{label}</span><strong>{value}/7</strong></span>
      <input className="w-full accent-primary" type="range" min={1} max={7} value={value} onChange={(event) => setter(Number(event.target.value))} />
    </label>
  )

  return (
    <main className="humanos-operating-page min-h-screen overflow-y-auto px-4 pb-28 pt-6 md:px-8">
      <div className="humanos-operating-container mx-auto max-w-6xl space-y-6">
        <header>
          <Link href={mode === 'interruption' ? '/app/focus' : '/app'} className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('checkin.back')}</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / {mode === 'daily' ? 'Check-in' : 'Context Dump'}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{t(`checkin.${mode}Title`)}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t(`checkin.${mode}Subtitle`)}</p>
        </header>

        {mode === 'daily' ? (
          <Card>
            <CardHeader><CardTitle>{t('checkin.currentState')}</CardTitle><CardDescription>{t('checkin.currentStateDescription')}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">{slider(t('checkin.focus'), focus, setFocus, <Brain className="h-4 w-4" />)}{slider(t('checkin.energy'), energy, setEnergy, <BatteryMedium className="h-4 w-4" />)}{slider(t('checkin.stress'), stress, setStress, <Gauge className="h-4 w-4" />)}</div>
              <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1.5 text-sm"><span>{t('checkin.mood')}</span><select className="h-10 rounded-md border bg-background px-3" value={mood} onChange={(event) => setMood(event.target.value)}><option value="positive">{t('checkin.positive')}</option><option value="neutral">{t('checkin.neutral')}</option><option value="low">{t('checkin.low')}</option><option value="anxious">{t('checkin.anxious')}</option></select></label><label className="grid gap-1.5 text-sm"><span>{t('checkin.readiness')}</span><select className="h-10 rounded-md border bg-background px-3" value={readiness} onChange={(event) => setReadiness(event.target.value)}><option value="ready">{t('checkin.ready')}</option><option value="unsure">{t('checkin.unsure')}</option><option value="need_rest">{t('checkin.needRest')}</option></select></label></div>
              <label className="grid gap-1.5 text-sm"><span>{t('checkin.attentionResidue')}</span><Input value={attentionResidue} onChange={(event) => setAttentionResidue(event.target.value)} placeholder={t('checkin.attentionResiduePlaceholder')} /></label>
              <label className="grid gap-1.5 text-sm"><span>{t('checkin.dailyNote')}</span><textarea className="min-h-28 rounded-md border bg-background p-3 text-sm" value={dailyNote} onChange={(event) => setDailyNote(event.target.value)} placeholder={t('checkin.dailyNotePlaceholder')} /></label>
              {saved ? <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-700"><span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />{t('checkin.saved')}</span><Button asChild size="sm"><Link href="/app">{t('checkin.openWorkspace')}</Link></Button></div> : <Button className="w-full" onClick={saveDailyCheckIn} disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('checkin.saveState')}</Button>}
              {dailyReview?.requires_plan_adjustment && dailyReview.first_session && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h3 className="font-semibold">{locale === 'zh' ? '今天的第一个任务需要复核' : 'Your first session needs review'}</h3><p className="mt-2 text-sm"><strong>{dailyReview.first_session.task_title || dailyReview.first_session.task_id}</strong>{locale === 'zh' ? ` 原计划于 ${dailyReview.first_session.planned_start_at ? new Date(dailyReview.first_session.planned_start_at).toLocaleTimeString() : '—'} 开始。` : ` was planned for ${dailyReview.first_session.planned_start_at ? new Date(dailyReview.first_session.planned_start_at).toLocaleTimeString() : '—'}.`}</p>{dailyReview.recommendation && <p className="mt-2 text-sm">{locale === 'zh' ? `建议从 ${new Date(dailyReview.recommendation.start_at).toLocaleTimeString()} 开始，首段调整为 ${dailyReview.recommendation.duration_minutes} 分钟。` : `Suggested start: ${new Date(dailyReview.recommendation.start_at).toLocaleTimeString()}, with a ${dailyReview.recommendation.duration_minutes}-minute first session.`}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" asChild><Link href="/app/plan?adjust=daily-checkin">{locale === 'zh' ? '生成调整计划' : 'Generate adjustment'}</Link></Button><Button size="sm" variant="secondary" asChild><Link href="/app/plan?adjust=manual">{locale === 'zh' ? '我自己修改' : 'Edit manually'}</Link></Button><Button size="sm" variant="ghost" onClick={() => setDailyReview(null)}>{locale === 'zh' ? '保持原计划' : 'Keep current plan'}</Button></div></div>}
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
              <CardContent>{reentry ? <div className="space-y-4"><div className="rounded-xl bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('checkin.firstStep')}</p><p className="mt-2 text-lg font-medium">{reentry.first_step || nextAction}</p></div>{reentry.progress && <div><p className="text-xs text-muted-foreground">{t('checkin.savedProgress')}</p><p className="mt-1 text-sm">{reentry.progress}</p></div>}<p className="text-sm text-muted-foreground">{t('checkin.remaining')}: {reentry.remaining_duration_minutes ?? remainingMinutes} min</p><Button className="w-full" asChild><Link href="/app/focus"><CornerDownRight className="mr-2 h-4 w-4" />{t('checkin.returnToFocus')}</Link></Button></div> : <p className="text-sm text-muted-foreground">{t('checkin.reentryEmpty')}</p>}</CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
