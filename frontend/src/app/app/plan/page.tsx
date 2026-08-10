'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CalendarCheck, Loader2, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/client/api'
import type { HumanOSTask } from '@/lib/contracts/task-contracts'
import type { PlanBlock, PlanDecision, PlanResourceEnvelope, PlanValidation, WeekStatus } from '@/lib/contracts/planning-contracts'
import type { ResourceEnvelope } from '@/lib/contracts/api-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

type Stage = 'setup' | 'review' | 'confirmed'

const DAYS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function hourLabel(value: number) {
  const hour = Math.floor(value)
  const minute = Math.round((value - hour) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export default function WeeklyPlanPage() {
  const { t, locale } = useTranslation()
  const searchParams = useSearchParams()
  const adjustmentTrigger = searchParams.get('adjust') || ''
  const proposalRequested = searchParams.get('proposal') === 'latest'
  const [stage, setStage] = useState<Stage>('setup')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [weekStatus, setWeekStatus] = useState<WeekStatus | null>(null)
  const [profile, setProfile] = useState<Record<string, any> | null>(null)
  const [tasks, setTasks] = useState<HumanOSTask[]>([])
  const [activePlan, setActivePlan] = useState<PlanDecision | null>(null)
  const [decision, setDecision] = useState<PlanDecision | null>(null)
  const [blocks, setBlocks] = useState<PlanBlock[]>([])
  const [validation, setValidation] = useState<PlanValidation | null>(null)
  const [rationaleRequired, setRationaleRequired] = useState(false)
  const [rationale, setRationale] = useState('')
  const [carryIds, setCarryIds] = useState<string[]>([])
  const [weeklyGoal, setWeeklyGoal] = useState('')
  const [availableWindows, setAvailableWindows] = useState('')
  const [temporaryConstraints, setTemporaryConstraints] = useState('')
  const [keepBuffer, setKeepBuffer] = useState(true)

  const days = locale === 'zh' ? DAYS_ZH : DAYS_EN
  const weekId = weekStatus?.current_week_id || ''

  const loadPlanningState = useCallback(async () => {
    setLoading(true)
    try {
      const [status, profileData, taskData, planData, proposalData] = await Promise.all([
        apiRequest<WeekStatus>('/api/weeks/status'),
        apiRequest<ResourceEnvelope<{ profile: Record<string, any> }>>('/api/profile'),
        apiRequest<ResourceEnvelope<{ tasks: HumanOSTask[] }>>('/api/tasks'),
        apiRequest<PlanResourceEnvelope<{ plan: PlanDecision | null }>>('/api/plans/active'),
        apiRequest<PlanResourceEnvelope<{ plan: PlanDecision | null }>>('/api/plans/proposed'),
      ])
      const unfinishedIds = new Set((status.unfinished_task_ids || []).map(String))
      const unfinishedTasks = (taskData.data.tasks || []).filter((task) => unfinishedIds.has(String(task.id)))
      setWeekStatus(status)
      setProfile(profileData.data.profile)
      setTasks(unfinishedTasks)
      setCarryIds(unfinishedTasks.map((task) => String(task.id)))
      const weekly = profileData.data.profile?.weekly_context || {}
      setWeeklyGoal(String(weekly.weekly_goal || ''))
      setAvailableWindows(String(weekly.weekly_available_windows || ''))
      setTemporaryConstraints(
        Array.isArray(weekly.temporary_constraints)
          ? weekly.temporary_constraints.join('\n')
          : String(weekly.temporary_constraints || ''),
      )
      setKeepBuffer(weekly.keep_buffer !== false)
      setActivePlan(planData.data.plan)
      if (proposalRequested && proposalData.data.plan) {
        setDecision(proposalData.data.plan)
        setBlocks(proposalData.data.plan.plan_patch || [])
        setValidation(proposalData.data.plan.validation || null)
        setStage('review')
      } else if (planData.data.plan?.plan_status === 'confirmed' && !adjustmentTrigger) setStage('confirmed')
      else setStage('setup')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('planning.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [adjustmentTrigger, proposalRequested, t])

  useEffect(() => {
    void loadPlanningState()
  }, [loadPlanningState])

  const taskName = useMemo(
    () => new Map(tasks.map((task) => [String(task.id), task.title || t('planning.untitledTask')])),
    [tasks, t],
  )

  const updateTask = (index: number, field: string, value: string | number) => {
    setTasks((current) => current.map((task, taskIndex) => (
      taskIndex === index ? { ...task, [field]: value } : task
    )))
  }

  const deleteTask = async (task: HumanOSTask) => {
    if (!task.id || !window.confirm(locale === 'zh' ? `删除任务“${task.title}”？` : `Delete “${task.title}”?`)) return
    try {
      await apiRequest('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.id }) })
      setTasks((current) => current.filter((item) => item.id !== task.id))
      setDecision(null); setValidation(null); setBlocks([]); setStage('setup')
      toast(locale === 'zh' ? '任务已删除，计划需要重新生成' : 'Task deleted. Regenerate the plan.')
    } catch (error) {
      toast(error instanceof Error ? error.message : (locale === 'zh' ? '删除失败' : 'Delete failed'))
    }
  }

  const saveSetup = async () => {
    if (!profile || !weekId) return
    setSubmitting(true)
    try {
      const weeklyContext = {
        ...(profile.weekly_context || {}),
        week_id: weekId,
        week_of: weekId,
        weekly_goal: weeklyGoal,
        weekly_available_windows: availableWindows,
        temporary_constraints: temporaryConstraints.split('\n').map((item) => item.trim()).filter(Boolean),
        keep_buffer: keepBuffer,
      }
      await apiRequest('/api/weekly-setup/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_id: weekId,
          profile: { ...profile, weekly_context: weeklyContext },
          tasks: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            due: task.due || task.deadline || task.deadline_at,
            duration: Number(task.duration || task.estimated_duration || 60),
            priority: task.priority || 'medium',
            context: task.context || '',
            contextWindow: task.contextWindow || task.context_window || {},
          })),
        }),
      })
      await loadPlanningState()
      toast(t('planning.setupSaved'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('planning.saveFailed'))
      throw error
    } finally {
      setSubmitting(false)
    }
  }

  const generatePlan = async () => {
    setSubmitting(true)
    try {
      await saveSetup()
      const result = await apiRequest<{ decision: PlanDecision }>('/api/schedules/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId, client_now: new Date().toISOString(), adjustment_trigger: adjustmentTrigger || undefined }),
      })
      if (result.decision?.unavailable || result.decision?.error) {
        throw new Error(result.decision.error || t('planning.aiUnavailable'))
      }
      setDecision(result.decision)
      setBlocks(result.decision.plan_patch || [])
      setValidation(result.decision.validation || null)
      setStage('review')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('planning.generateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const updateBlock = (index: number, field: 'day_index' | 'start' | 'end', value: number) => {
    setBlocks((current) => current.map((block, blockIndex) => {
      if (blockIndex !== index) return block
      const updated = { ...block, [field]: value }
      updated.session_minutes = Math.max(Math.round((updated.end - updated.start) * 60), 0)
      return updated
    }))
    setValidation(null)
  }

  const validatePlan = async () => {
    setSubmitting(true)
    try {
      const result = await apiRequest<{ validation: PlanValidation }>('/api/schedules/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId, plan_patch: blocks }),
      })
      setValidation(result.validation)
      toast(result.validation.valid ? t('planning.validPlan') : t('planning.invalidPlan'))
      return result.validation
    } catch (error) {
      toast(error instanceof Error ? error.message : t('planning.validateFailed'))
      return null
    } finally {
      setSubmitting(false)
    }
  }

  const confirmPlan = async () => {
    if (!decision) return
    setSubmitting(true)
    try {
      const checked = validation?.valid ? validation : await validatePlan()
      if (!checked?.valid) return
      const result = await apiRequest<any>('/api/schedules/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: decision.plan_id,
          week_id: weekId,
          edit_episode_id: decision.edit_episode_id,
          plan_patch: blocks,
          unscheduled_tasks: decision.unscheduled_tasks || [],
          ai_task_analysis: decision.ai_task_analysis || {},
          decision: { ...decision, plan_patch: blocks },
          ...(rationaleRequired ? {
            rationale: {
              raw_user_response: rationale,
              reason_codes: ['user_adjusted_schedule'],
              generalizability: 'not_sure',
              affected_task_ids: Array.from(new Set(blocks.map((block) => block.task_id))),
            },
          } : {}),
        }),
      })
      if (result.requires_rationale) {
        setRationaleRequired(true)
        toast(t('planning.rationaleRequired'))
        return
      }
      const activePlanResult = await apiRequest<PlanResourceEnvelope<{ plan: PlanDecision | null }>>('/api/plans/active')
      setActivePlan(activePlanResult.data.plan)
      setRationaleRequired(false)
      setStage('confirmed')
      window.dispatchEvent(new CustomEvent('humanos:plan-updated', {
        detail: { source: 'plan-confirmation', planRevision: activePlanResult.data.plan?.plan_revision },
      }))
      toast(t('planning.confirmed'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('planning.confirmFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const rolloverWeek = async () => {
    setSubmitting(true)
    try {
      await apiRequest('/api/weeks/rollover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId, use_last_week: true, carry_task_ids: carryIds }),
      })
      await loadPlanningState()
      toast(t('planning.weekStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('planning.rolloverFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
  }

  return (
    <main className="humanos-operating-page min-h-screen overflow-y-auto px-4 pb-28 pt-6 md:px-8">
      <div className="humanos-operating-container mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/app" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('planning.workspace')}</Link>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">HumanOS / {weekId}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{t('planning.title')}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">{t('planning.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            {(['setup', 'review', 'confirmed'] as Stage[]).map((item, index) => (
              <div key={item} className={`rounded-full px-3 py-1 text-xs ${stage === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{index + 1}. {t(`planning.${item}`)}</div>
            ))}
          </div>
        </header>

        {weekStatus?.new_week && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader><CardTitle className="text-lg">{t('planning.newWeek')}</CardTitle><CardDescription>{t('planning.newWeekDescription')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {tasks.map((task) => (
                <label key={task.id} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={carryIds.includes(String(task.id))} onChange={(event) => setCarryIds((current) => event.target.checked ? [...current, String(task.id)] : current.filter((id) => id !== task.id))} />
                  {task.title}
                </label>
              ))}
              <Button onClick={rolloverWeek} disabled={submitting}>{t('planning.startWeek')}</Button>
            </CardContent>
          </Card>
        )}

        {adjustmentTrigger && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader><CardTitle className="text-lg">{locale === 'zh' ? '根据当前状态重新规划' : 'Replan from your current state'}</CardTitle><CardDescription>{locale === 'zh' ? '系统会使用刚刚的 Daily Check-in，重新计算今天第一个未开始 Session。生成后仍需预览、验证并确认，现有计划不会被直接覆盖。' : 'HumanOS will use your latest Daily Check-in to reconsider today’s first unstarted session. The result still requires review, validation, and confirmation.'}</CardDescription></CardHeader>
          </Card>
        )}

        {stage === 'setup' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Card>
              <CardHeader><CardTitle>{t('planning.weekContext')}</CardTitle><CardDescription>{t('planning.weekContextDescription')}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <label className="grid gap-1.5 text-sm"><span>{t('planning.weeklyGoal')}</span><Input value={weeklyGoal} onChange={(event) => setWeeklyGoal(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm"><span>{t('planning.availableWindows')}</span><textarea className="min-h-24 rounded-md border bg-background p-3 text-sm" value={availableWindows} onChange={(event) => setAvailableWindows(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm"><span>{t('planning.temporaryConstraints')}</span><textarea className="min-h-24 rounded-md border bg-background p-3 text-sm" value={temporaryConstraints} onChange={(event) => setTemporaryConstraints(event.target.value)} /></label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={keepBuffer} onChange={(event) => setKeepBuffer(event.target.checked)} />{t('planning.keepBuffer')}</label>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t('planning.weekTasks')}</CardTitle><CardDescription>{t('planning.weekTasksDescription')}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {tasks.length === 0 && <p className="text-sm text-muted-foreground">{t('planning.noTasks')}</p>}
                {tasks.map((task, index) => (
                  <div key={task.id || index} className="grid gap-2 rounded-xl border bg-background/70 p-3 md:grid-cols-[1fr_1fr_110px_100px_40px]">
                    <Input value={task.title || ''} onChange={(event) => updateTask(index, 'title', event.target.value)} placeholder={t('planning.taskTitle')} />
                    <Input value={String(task.due || task.deadline || task.deadline_at || '')} onChange={(event) => updateTask(index, 'due', event.target.value)} placeholder={t('planning.deadline')} />
                    <Input type="number" min={15} step={15} value={Number(task.duration || task.estimated_duration || 60)} onChange={(event) => updateTask(index, 'duration', Number(event.target.value))} />
                    <select className="rounded-md border bg-background px-2 text-sm" value={String(task.priority || 'medium')} onChange={(event) => updateTask(index, 'priority', event.target.value)}><option value="high">{t('taskDialog.priorityHigh')}</option><option value="medium">{t('taskDialog.priorityMedium')}</option><option value="low">{t('taskDialog.priorityLow')}</option></select>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void deleteTask(task)} aria-label={locale === 'zh' ? '删除任务' : 'Delete task'}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={saveSetup} disabled={submitting}>{t('planning.saveSetup')}</Button><Button onClick={generatePlan} disabled={submitting || weekStatus?.new_week}><Sparkles className="mr-2 h-4 w-4" />{t('planning.generate')}</Button></div>
              </CardContent>
            </Card>
          </div>
        )}

        {stage === 'review' && decision && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
            <Card>
              <CardHeader><CardTitle>{t('planning.reviewTitle')}</CardTitle><CardDescription>{decision.explanation || t('planning.reviewDescription')}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {blocks.map((block, index) => (
                  <div key={block.block_id || `${block.task_id}-${index}`} className="grid items-center gap-2 rounded-xl border p-3 md:grid-cols-[1fr_120px_90px_90px]">
                    <div><p className="font-medium">{block.title || taskName.get(block.task_id)}</p><p className="text-xs text-muted-foreground">{block.kind || 'task_session'}</p></div>
                    <select className="h-10 rounded-md border bg-background px-2 text-sm" value={block.day_index} onChange={(event) => updateBlock(index, 'day_index', Number(event.target.value))}>{days.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select>
                    <Input type="number" min={0} max={24} step={0.25} value={block.start} onChange={(event) => updateBlock(index, 'start', Number(event.target.value))} />
                    <Input type="number" min={0} max={24} step={0.25} value={block.end} onChange={(event) => updateBlock(index, 'end', Number(event.target.value))} />
                    <p className="text-xs text-muted-foreground md:col-start-2 md:col-span-3">{days[block.day_index]} {hourLabel(block.start)}–{hourLabel(block.end)}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-3"><Button variant="outline" onClick={() => setStage('setup')}>{t('planning.backToSetup')}</Button><div className="flex gap-2"><Button variant="outline" onClick={validatePlan} disabled={submitting}><ShieldCheck className="mr-2 h-4 w-4" />{t('planning.validate')}</Button><Button onClick={confirmPlan} disabled={submitting || validation?.valid === false}><CalendarCheck className="mr-2 h-4 w-4" />{t('planning.confirm')}</Button></div></div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className={validation?.valid ? 'border-emerald-500/40' : validation ? 'border-destructive/40' : ''}><CardHeader><CardTitle className="text-lg">{t('planning.validation')}</CardTitle><CardDescription>{validation ? (validation.valid ? t('planning.validPlan') : t('planning.invalidPlan')) : t('planning.notValidated')}</CardDescription></CardHeader><CardContent className="space-y-2">{validation?.violations?.map((item, index) => <p key={index} className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{item.message || item.type}</p>)}</CardContent></Card>
              {Boolean(decision.unscheduled_tasks?.length) && <Card><CardHeader><CardTitle className="text-lg">{t('planning.unscheduled')}</CardTitle></CardHeader><CardContent><pre className="whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(decision.unscheduled_tasks, null, 2)}</pre></CardContent></Card>}
              {rationaleRequired && <Card className="border-primary/40"><CardHeader><CardTitle className="text-lg">{t('planning.whyChanged')}</CardTitle><CardDescription>{t('planning.whyChangedDescription')}</CardDescription></CardHeader><CardContent><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={rationale} onChange={(event) => setRationale(event.target.value)} /><Button className="mt-3 w-full" onClick={confirmPlan} disabled={!rationale.trim() || submitting}>{t('planning.submitRationale')}</Button></CardContent></Card>}
            </div>
          </div>
        )}

        {stage === 'confirmed' && (
          <Card className="overflow-hidden border-emerald-500/30 bg-emerald-500/5">
            <CardHeader><div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white"><CalendarCheck /></div><CardTitle>{t('planning.confirmedTitle')}</CardTitle><CardDescription>{t('planning.confirmedDescription')}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-background px-3 py-1 text-sm">{t('planning.revision')} {activePlan?.plan_revision || decision?.plan_revision || 1}</span><span className="rounded-full bg-background px-3 py-1 text-sm">{activePlan?.plan_status || 'confirmed'}</span><Button asChild><Link href="/app">{t('planning.openCalendar')}</Link></Button><Button variant="outline" onClick={() => setStage('setup')}><RefreshCw className="mr-2 h-4 w-4" />{t('planning.revise')}</Button></CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
