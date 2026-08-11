'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n/LanguageProvider'

type ContextKind = 'fixed_event' | 'recurring_routine' | 'flexible_activity'
type ContextItem = { id: string; type: ContextKind; title: string; day: string; start: string; end: string }
type TaskDraft = { id: string; title: string; due: string; duration: number; priority: string; expected_difficulty: number; dependency: string }

const STORAGE_KEY = 'humanos:onboarding-draft:v2'
const STEPS = ['context', 'rhythm', 'week', 'tasks'] as const

function stableId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}_${uuid || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`
}

function initialContext(type: ContextKind): ContextItem {
  return { id: stableId('ctx'), type, title: '', day: 'Monday', start: '09:00', end: '10:00' }
}

function initialTask(): TaskDraft {
  return { id: stableId('task'), title: '', due: '', duration: 45, priority: 'medium', expected_difficulty: 5, dependency: '' }
}

export default function OnboardingPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [restored, setRestored] = useState(false)
  const [role, setRole] = useState('research_student')
  const [learningMode, setLearningMode] = useState('reading_writing')
  const [failureReasons, setFailureReasons] = useState<string[]>([])
  const [recentFailure, setRecentFailure] = useState('')
  const [deepWorkWindow, setDeepWorkWindow] = useState('09:00-11:30')
  const [lowEnergyWindow, setLowEnergyWindow] = useState('14:00-15:30')
  const [sessionMinutes, setSessionMinutes] = useState(45)
  const [breakMinutes, setBreakMinutes] = useState(10)
  const [dayEnergy, setDayEnergy] = useState({ morning: 5, afternoon: 4, evening: 3 })
  const [availableWindows, setAvailableWindows] = useState('Monday-Sunday 08:00-21:00')
  const [contextItems, setContextItems] = useState<ContextItem[]>([])
  const [keepBuffer, setKeepBuffer] = useState(true)
  const [weeklyGoal, setWeeklyGoal] = useState('')
  const [tasks, setTasks] = useState<TaskDraft[]>([initialTask()])
  const [momentary, setMomentary] = useState({ focus: 4, energy: 4, stress: 3, mood: 'steady' })

  const draft = useMemo(() => ({ step, role, learningMode, failureReasons, recentFailure, deepWorkWindow, lowEnergyWindow, sessionMinutes, breakMinutes, dayEnergy, availableWindows, contextItems, keepBuffer, weeklyGoal, tasks, momentary }), [step, role, learningMode, failureReasons, recentFailure, deepWorkWindow, lowEnergyWindow, sessionMinutes, breakMinutes, dayEnergy, availableWindows, contextItems, keepBuffer, weeklyGoal, tasks, momentary])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved) {
        setStep(Math.min(Number(saved.step) || 0, 3)); setRole(saved.role || role); setLearningMode(saved.learningMode || learningMode)
        setFailureReasons(saved.failureReasons || []); setRecentFailure(saved.recentFailure || '')
        setDeepWorkWindow(saved.deepWorkWindow || deepWorkWindow); setLowEnergyWindow(saved.lowEnergyWindow || lowEnergyWindow)
        setSessionMinutes(Number(saved.sessionMinutes) || 45); setBreakMinutes(Number(saved.breakMinutes) || 10)
        setDayEnergy(saved.dayEnergy || dayEnergy); setAvailableWindows(saved.availableWindows || availableWindows)
        setContextItems(saved.contextItems || []); setKeepBuffer(saved.keepBuffer !== false); setWeeklyGoal(saved.weeklyGoal || '')
        setTasks(saved.tasks?.length ? saved.tasks : [initialTask()]); setMomentary(saved.momentary || momentary)
      }
    } catch { localStorage.removeItem(STORAGE_KEY) }
    setRestored(true)
    // Initial restoration intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (restored) localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  }, [draft, restored])

  const patchContext = (id: string, patch: Partial<ContextItem>) => setContextItems((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  const patchTask = (id: string, patch: Partial<TaskDraft>) => setTasks((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  const toggleFailure = (value: string) => setFailureReasons((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])

  async function saveProgress(nextStep: number) {
    setLoading(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload(nextStep)),
      })
      if (!response.ok) throw new Error(t('onboarding.saveFailed'))
      setStep(nextStep)
    } catch (error) { toast.error(error instanceof Error ? error.message : t('onboarding.saveFailed')) }
    finally { setLoading(false) }
  }

  function profilePayload(currentStep = step) {
    return {
      role,
      deep_work_window: deepWorkWindow,
      low_energy_window: lowEnergyWindow,
      blocker_patterns: failureReasons,
      task_preferences: { learning_mode: learningMode, preferred_session_minutes: sessionMinutes, rest_between_tasks_minutes: breakMinutes, typical_energy: dayEnergy },
      research_context: { planning_failure_reasons: failureReasons, recent_plan_failure: recentFailure, onboarding_step: currentStep, onboarding_completed: false },
    }
  }

  async function finish() {
    const readyTasks = tasks.filter((task) => task.title.trim())
    if (!availableWindows.trim() || !weeklyGoal.trim() || readyTasks.length === 0) {
      toast.error(t('onboarding.requiredError')); return
    }
    setLoading(true)
    try {
      const profileResponse = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...profilePayload(3), research_context: { ...profilePayload(3).research_context, onboarding_completed: true } }) })
      if (!profileResponse.ok) throw new Error(t('onboarding.saveFailed'))

      const weekResponse = await fetch('/api/weekly-setup/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: { ...profilePayload(3), weekly_context: { weekly_goal: weeklyGoal, weekly_available_windows: availableWindows, context_items: contextItems.filter((item) => item.title.trim()), keep_buffer: keepBuffer } },
          tasks: readyTasks.map((task) => ({
            title: task.title.trim(),
            due: task.due.trim() || null,
            duration: Number(task.duration),
            priority: task.priority,
            expected_difficulty: Number(task.expected_difficulty),
            dependency: task.dependency.trim(),
            status: 'queued',
          })),
        }),
      })
      if (!weekResponse.ok) {
        const error = await weekResponse.json().catch(() => ({})) as { message?: string; error?: string }
        throw new Error(error.message || error.error || t('onboarding.weekFailed'))
      }

      const stateResponse = await fetch('/api/state-checkins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...momentary, source: 'onboarding' }) })
      if (!stateResponse.ok) throw new Error(t('onboarding.stateFailed'))

      const planResponse = await fetch('/api/schedules/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'onboarding' }) })
      if (!planResponse.ok) throw new Error(t('onboarding.planFailed'))
      localStorage.removeItem(STORAGE_KEY)
      toast.success(t('onboarding.planReady'))
      router.push('/app/plan')
    } catch (error) { toast.error(error instanceof Error ? error.message : t('onboarding.saveFailed')) }
    finally { setLoading(false) }
  }

  const selectClass = (selected: boolean) => `rounded-xl border px-3 py-2 text-sm transition ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eef5e8,_transparent_38%),linear-gradient(135deg,#faf8f1,#f0f4ef)] p-4 md:p-10">
    <Card className="mx-auto max-w-4xl border-[#d5d7cc] bg-white/90 shadow-xl shadow-[#52614c]/10">
      <CardHeader className="border-b border-[#e3e3da]">
        <div className="flex items-start justify-between gap-4"><div><CardTitle className="text-2xl">{t('onboarding.title')}</CardTitle><p className="mt-2 text-sm text-muted-foreground">{t('onboarding.subtitle')}</p></div><Badge variant="secondary">{t(`onboarding.step${step + 1}of`)}</Badge></div>
        <div className="mt-5 grid grid-cols-4 gap-2">{STEPS.map((item, index) => <div key={item} className={`h-1.5 rounded-full ${index <= step ? 'bg-[#315b42]' : 'bg-[#e5e5dd]'}`} />)}</div>
      </CardHeader>
      <CardContent className="p-6 md:p-8">
        <h2 className="text-xl font-semibold">{t(`onboarding.step${step + 1}Title`)}</h2><p className="mt-1 text-sm text-muted-foreground">{t(`onboarding.step${step + 1}Desc`)}</p>

        {step === 0 && <div className="mt-7 grid gap-7">
          <Field label={t('onboarding.roleLabel')}><div className="flex flex-wrap gap-2">{['research_student','coursework_student','thesis_stage','project_stage'].map((value, index) => <button key={value} className={selectClass(role === value)} onClick={() => setRole(value)}>{t(`onboarding.role${['Graduate','Coursework','Thesis','Project'][index]}`)}</button>)}</div></Field>
          <Field label={t('onboarding.learningModeLabel')}><div className="flex flex-wrap gap-2">{['reading_writing','visual','discussion','practice','mixed'].map((value, index) => <button key={value} className={selectClass(learningMode === value)} onClick={() => setLearningMode(value)}>{t(`onboarding.mode${['Reading','Visual','Discussion','Practice','Mixed'][index]}`)}</button>)}</div></Field>
          <Field label={t('onboarding.blockersLabel')}><div className="grid gap-2 sm:grid-cols-2">{['task_ambiguity','fatigue','interruption','context_loss','underestimated_duration','priority_change'].map((value, index) => <label key={value} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={failureReasons.includes(value)} onCheckedChange={() => toggleFailure(value)} />{t(`onboarding.blocker${['Ambiguity','Fatigue','Interruption','ContextLoss','Duration','Priority'][index]}`)}</label>)}</div></Field>
          <Field label={t('onboarding.planningGapLabel')}><textarea className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={recentFailure} onChange={(event) => setRecentFailure(event.target.value)} placeholder={t('onboarding.planningGapPlaceholder')} /></Field>
        </div>}

        {step === 1 && <div className="mt-7 grid gap-6 md:grid-cols-2">
          <Field label={t('onboarding.deepWorkLabel')}><Input value={deepWorkWindow} onChange={(e) => setDeepWorkWindow(e.target.value)} /></Field>
          <Field label={t('onboarding.lowEnergyLabel')}><Input value={lowEnergyWindow} onChange={(e) => setLowEnergyWindow(e.target.value)} /></Field>
          <Field label={t('onboarding.sessionLengthLabel')}><NumberChoices value={sessionMinutes} values={[25,45,60,90]} onChange={setSessionMinutes} /></Field>
          <Field label={t('onboarding.breakLengthLabel')}><NumberChoices value={breakMinutes} values={[5,10,15,20]} onChange={setBreakMinutes} /></Field>
          {(['morning','afternoon','evening'] as const).map((period) => <Field key={period} label={t(`onboarding.${period}Energy`)}><input type="range" min="1" max="7" value={dayEnergy[period]} onChange={(e) => setDayEnergy({ ...dayEnergy, [period]: Number(e.target.value) })} className="w-full" /><span className="text-sm font-medium">{dayEnergy[period]}/7</span></Field>)}
        </div>}

        {step === 2 && <div className="mt-7 grid gap-6">
          <Field label={t('onboarding.windowsLabel')}><textarea className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={availableWindows} onChange={(e) => setAvailableWindows(e.target.value)} placeholder={t('onboarding.windowsPlaceholder')} /></Field>
          <div className="space-y-3">{contextItems.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border bg-[#fafaf6] p-3 md:grid-cols-[150px_1fr_110px_110px_110px_40px]">
            <select className="rounded-md border bg-white px-2 text-sm" value={item.type} onChange={(e) => patchContext(item.id, { type: e.target.value as ContextKind })}><option value="fixed_event">{t('onboarding.fixedTime')}</option><option value="recurring_routine">{t('onboarding.routineTime')}</option><option value="flexible_activity">{t('onboarding.flexibleTime')}</option></select>
            <Input value={item.title} onChange={(e) => patchContext(item.id, { title: e.target.value })} placeholder={t('onboarding.activityName')} /><Input value={item.day} onChange={(e) => patchContext(item.id, { day: e.target.value })} /><Input type="time" value={item.start} onChange={(e) => patchContext(item.id, { start: e.target.value })} /><Input type="time" value={item.end} onChange={(e) => patchContext(item.id, { end: e.target.value })} /><Button size="icon" variant="ghost" onClick={() => setContextItems((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
          </div>)}<Button variant="outline" onClick={() => setContextItems([...contextItems, initialContext('fixed_event')])}><Plus className="mr-2 h-4 w-4" />{t('onboarding.addActivity')}</Button></div>
          <label className="flex items-center gap-3 rounded-xl border p-4 text-sm"><Checkbox checked={keepBuffer} onCheckedChange={(checked) => setKeepBuffer(checked === true)} /><span><strong>{t('onboarding.bufferLabel')}</strong><span className="block text-muted-foreground">{t('onboarding.bufferHint')}</span></span></label>
        </div>}

        {step === 3 && <div className="mt-7 grid gap-6">
          <Field label={t('onboarding.goalLabel')}><textarea className="min-h-20 w-full rounded-xl border bg-background p-3 text-sm" value={weeklyGoal} onChange={(e) => setWeeklyGoal(e.target.value)} /></Field>
          <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-medium">{t('onboarding.tasksLabel')}</h3><Button variant="outline" size="sm" onClick={() => setTasks([...tasks, initialTask()])}><Plus className="mr-1 h-4 w-4" />{t('onboarding.addTask')}</Button></div>{tasks.map((task) => <div key={task.id} className="grid gap-2 rounded-xl border bg-[#fafaf6] p-3 md:grid-cols-[1.4fr_1fr_100px_110px_90px_1fr_40px]">
            <Input value={task.title} onChange={(e) => patchTask(task.id, { title: e.target.value })} placeholder={t('onboarding.taskName')} /><Input value={task.due} onChange={(e) => patchTask(task.id, { due: e.target.value })} placeholder={t('onboarding.deadline')} /><Input type="number" min="15" step="15" value={task.duration} onChange={(e) => patchTask(task.id, { duration: Number(e.target.value) })} /><select className="rounded-md border bg-white px-2 text-sm" value={task.priority} onChange={(e) => patchTask(task.id, { priority: e.target.value })}><option value="high">{t('taskDialog.priorityHigh')}</option><option value="medium">{t('taskDialog.priorityMedium')}</option><option value="low">{t('taskDialog.priorityLow')}</option></select><Input type="number" min="1" max="10" value={task.expected_difficulty} onChange={(e) => patchTask(task.id, { expected_difficulty: Number(e.target.value) })} /><Input value={task.dependency} onChange={(e) => patchTask(task.id, { dependency: e.target.value })} placeholder={t('onboarding.dependency')} /><Button size="icon" variant="ghost" disabled={tasks.length === 1} onClick={() => setTasks((items) => items.filter((entry) => entry.id !== task.id))}><Trash2 className="h-4 w-4" /></Button>
          </div>)}</div>
          <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-4">{(['focus','energy','stress'] as const).map((key) => <Field key={key} label={t(`onboarding.${key}`)}><input type="range" min="1" max="7" value={momentary[key]} onChange={(e) => setMomentary({ ...momentary, [key]: Number(e.target.value) })} className="w-full" /><span className="text-sm">{momentary[key]}/7</span></Field>)}<Field label={t('onboarding.mood')}><Input value={momentary.mood} onChange={(e) => setMomentary({ ...momentary, mood: e.target.value })} /></Field></div>
        </div>}

        <div className="mt-8 flex justify-between border-t pt-5"><Button variant="outline" disabled={step === 0 || loading} onClick={() => setStep(step - 1)}>{t('onboarding.back')}</Button>{step < 3 ? <Button disabled={loading} onClick={() => saveProgress(step + 1)}>{loading ? t('onboarding.saving') : t('onboarding.next')}</Button> : <Button disabled={loading} onClick={finish}>{loading ? t('onboarding.buildingPlan') : t('onboarding.finish')}</Button>}</div>
      </CardContent>
    </Card>
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium">{label}<div className="flex items-center gap-3 font-normal">{children}</div></label> }
function NumberChoices({ value, values, onChange }: { value: number; values: number[]; onChange: (value: number) => void }) { return <div className="flex flex-wrap gap-2">{values.map((item) => <button type="button" key={item} onClick={() => onChange(item)} className={`rounded-lg border px-3 py-2 text-sm ${value === item ? 'border-primary bg-primary/10 text-primary' : ''}`}>{item} min</button>)}</div> }
