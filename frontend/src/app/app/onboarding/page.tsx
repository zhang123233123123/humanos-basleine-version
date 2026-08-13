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
import { useEvents } from '@/hooks/use-events'
import { WeeklyAvailabilityPicker } from '@/components/weekly-availability-picker'

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
  return { id: stableId('ctx'), type, title: '', day: 'Monday', start: '', end: '' }
}

function initialTask(): TaskDraft {
  return { id: stableId('task'), title: '', due: '', duration: 45, priority: 'medium', expected_difficulty: 5, dependency: '' }
}

function samplePlanningMonday() {
  const today = new Date()
  const day = today.getDay() || 7
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day + 1)
  // From Thursday onward, use the following week so every sample deadline is still actionable.
  if (day >= 4) monday.setDate(monday.getDate() + 7)
  return monday
}

function sampleDeadline(dayOffset: number, hour: number, minute = 0) {
  const value = samplePlanningMonday()
  value.setDate(value.getDate() + dayOffset)
  value.setHours(hour, minute, 0, 0)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function sampleContextItems(): ContextItem[] {
  return [
    { id: stableId('ctx'), type: 'fixed_event', title: 'Research meeting', day: 'Thursday', start: '10:00', end: '11:00' },
    { id: stableId('ctx'), type: 'recurring_routine', title: 'Lunch', day: 'Thursday', start: '12:00', end: '13:00' },
    { id: stableId('ctx'), type: 'recurring_routine', title: 'Lunch', day: 'Friday', start: '12:00', end: '13:00' },
    { id: stableId('ctx'), type: 'recurring_routine', title: 'Lunch', day: 'Saturday', start: '12:00', end: '13:00' },
    { id: stableId('ctx'), type: 'fixed_event', title: 'Dance class', day: 'Friday', start: '16:30', end: '18:00' },
  ]
}

function sampleTasks(): TaskDraft[] {
  return [
    { id: stableId('task'), title: 'Analyze interview transcripts', due: sampleDeadline(3, 17), duration: 150, priority: 'high', expected_difficulty: 8, dependency: '' },
    { id: stableId('task'), title: 'Revise literature review', due: sampleDeadline(4, 17), duration: 120, priority: 'high', expected_difficulty: 7, dependency: '' },
    { id: stableId('task'), title: 'Prepare supervisor update', due: sampleDeadline(4, 17, 30), duration: 45, priority: 'high', expected_difficulty: 5, dependency: 'Analyze interview transcripts' },
    { id: stableId('task'), title: 'Write findings section', due: sampleDeadline(5, 14), duration: 120, priority: 'high', expected_difficulty: 8, dependency: 'Analyze interview transcripts' },
    { id: stableId('task'), title: 'Create findings diagram', due: sampleDeadline(5, 16), duration: 75, priority: 'medium', expected_difficulty: 5, dependency: 'Analyze interview transcripts' },
    { id: stableId('task'), title: 'Do the laundry', due: sampleDeadline(3, 20), duration: 45, priority: 'low', expected_difficulty: 2, dependency: '' },
    { id: stableId('task'), title: 'Listen to English podcast', due: sampleDeadline(3, 20), duration: 30, priority: 'low', expected_difficulty: 2, dependency: '' },
  ]
}

export default function OnboardingPage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [restored, setRestored] = useState(false)
  const [role, setRole] = useState('research_student')
  const [learningMode, setLearningMode] = useState('reading_writing')
  const [failureReasons, setFailureReasons] = useState<string[]>(['interruption', 'underestimated_duration'])
  const [recentFailure, setRecentFailure] = useState('I often underestimate analysis work and lose context after interruptions.')
  const [deepWorkWindow, setDeepWorkWindow] = useState('09:00-11:30')
  const [lowEnergyWindow, setLowEnergyWindow] = useState('14:00-15:30')
  const [sessionMinutes, setSessionMinutes] = useState(45)
  const [breakMinutes, setBreakMinutes] = useState(15)
  const [dayEnergy, setDayEnergy] = useState({ morning: 6, afternoon: 4, evening: 3 })
  const [availableWindows, setAvailableWindows] = useState('Monday 08:00-18:00\nTuesday 08:00-18:00\nWednesday 08:00-21:00\nThursday 08:00-21:00\nFriday 08:00-21:00\nSaturday 09:00-17:00')
  const [contextItems, setContextItems] = useState<ContextItem[]>(sampleContextItems)
  const [keepBuffer, setKeepBuffer] = useState(true)
  const [weeklyGoal, setWeeklyGoal] = useState('Complete a reviewable draft of my research findings and prepare for my supervisor update.')
  const [tasks, setTasks] = useState<TaskDraft[]>(sampleTasks)
  const [momentary, setMomentary] = useState({ focus: 7, energy: 6, stress: 3, mood: 'steady' })

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
            request_id: task.id,
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
      if (!planResponse.ok) {
        const error = await planResponse.json().catch(() => ({})) as { message?: string; error?: string }
        throw new Error(error.message || error.error || t('onboarding.planFailed'))
      }
      const accepted = await planResponse.json() as { job?: { job_id?: string } }
      const jobId = accepted.job?.job_id
      if (!jobId) throw new Error(t('onboarding.planFailed'))
      let job: { status: string; error?: string } = { status: 'queued' }
      for (let attempt = 0; attempt < 180 && !['completed', 'failed'].includes(job.status); attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
        const statusResponse = await fetch(`/api/background-jobs?job_id=${encodeURIComponent(jobId)}`)
        if (!statusResponse.ok) throw new Error(t('onboarding.planFailed'))
        job = ((await statusResponse.json()) as { job: typeof job }).job
      }
      if (job.status !== 'completed') throw new Error(job.error || t('onboarding.planFailed'))
      localStorage.removeItem(STORAGE_KEY)
      // Force the workspace to load the draft created by this onboarding run.
      useEvents.getState().setEvents([])
      useEvents.getState().setCachedRanges([])
      toast.success(t('onboarding.planReady'))
      router.replace('/app')
    } catch (error) { toast.error(error instanceof Error ? error.message : t('onboarding.saveFailed')) }
    finally { setLoading(false) }
  }

  const selectClass = (selected: boolean) => `rounded-xl border px-3 py-2 text-sm font-medium transition ${selected ? 'border-[#165dff] bg-[#edf3ff] text-[#165dff]' : 'border-[#59616c] bg-white text-[#25302a] hover:border-[#315b42] hover:bg-[#f4f7f2]'}`

  return <main className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_left,_#eef5e8,_transparent_38%),linear-gradient(135deg,#faf8f1,#f0f4ef)] p-4 pb-12 md:p-10 md:pb-16">
    <Card className="onboarding-light mx-auto max-w-4xl border-[#d5d7cc] bg-white/95 text-[#17211b] shadow-xl shadow-[#52614c]/10 [&_input]:border-[#aeb6ad] [&_input]:bg-white [&_input]:text-[#17211b] [&_input]:placeholder:text-[#778279] [&_select]:border-[#aeb6ad] [&_select]:bg-white [&_select]:text-[#17211b] [&_textarea]:border-[#aeb6ad] [&_textarea]:bg-white [&_textarea]:text-[#17211b] [&_textarea]:placeholder:text-[#778279]">
      <CardHeader className="border-b border-[#e3e3da]">
        <div className="flex items-start justify-between gap-4"><div><CardTitle className="text-2xl">{t('onboarding.title')}</CardTitle><p className="mt-2 text-sm text-muted-foreground">{t('onboarding.subtitle')}</p></div><Badge variant="secondary">{t(`onboarding.step${step + 1}of`)}</Badge></div>
        <div className="mt-5 grid grid-cols-4 gap-2">{STEPS.map((item, index) => <div key={item} className={`h-1.5 rounded-full ${index <= step ? 'bg-[#315b42]' : 'bg-[#e5e5dd]'}`} />)}</div>
      </CardHeader>
      <CardContent className="p-6 md:p-8">
        <h2 className="text-xl font-semibold text-[#17211b]">{t(`onboarding.step${step + 1}Title`)}</h2><p className="mt-1 text-sm text-[#617067]">{t(`onboarding.step${step + 1}Desc`)}</p>

        {step === 0 && <div className="mt-7 grid gap-7">
          <Field label={t('onboarding.roleLabel')}><div className="flex flex-wrap gap-2">{['research_student','coursework_student','thesis_stage','project_stage'].map((value, index) => <button key={value} className={selectClass(role === value)} onClick={() => setRole(value)}>{t(`onboarding.role${['Graduate','Coursework','Thesis','Project'][index]}`)}</button>)}</div></Field>
          <Field label={t('onboarding.learningModeLabel')}><div className="flex flex-wrap gap-2">{['reading_writing','visual','discussion','practice','mixed'].map((value, index) => <button key={value} className={selectClass(learningMode === value)} onClick={() => setLearningMode(value)}>{t(`onboarding.mode${['Reading','Visual','Discussion','Practice','Mixed'][index]}`)}</button>)}</div></Field>
          <Field label={t('onboarding.blockersLabel')}><div className="grid gap-2 sm:grid-cols-2">{['task_ambiguity','fatigue','interruption','context_loss','underestimated_duration','priority_change'].map((value, index) => <label key={value} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={failureReasons.includes(value)} onCheckedChange={() => toggleFailure(value)} />{t(`onboarding.blocker${['Ambiguity','Fatigue','Interruption','ContextLoss','Duration','Priority'][index]}`)}</label>)}</div></Field>
          <Field label={t('onboarding.planningGapLabel')}><textarea className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={recentFailure} onChange={(event) => setRecentFailure(event.target.value)} placeholder={t('onboarding.planningGapPlaceholder')} /></Field>
        </div>}

        {step === 1 && <div className="mt-7 grid gap-6 md:grid-cols-2">
          <Field label={t('onboarding.deepWorkLabel')}><TimeRangeInput value={deepWorkWindow} onChange={setDeepWorkWindow} /></Field>
          <Field label={t('onboarding.lowEnergyLabel')}><TimeRangeInput value={lowEnergyWindow} onChange={setLowEnergyWindow} /></Field>
          <Field label={t('onboarding.sessionLengthLabel')}><NumberChoices value={sessionMinutes} values={[25,45,60,90]} onChange={setSessionMinutes} /></Field>
          <Field label={t('onboarding.breakLengthLabel')}><NumberChoices value={breakMinutes} values={[5,10,15,20]} onChange={setBreakMinutes} /></Field>
          {(['morning','afternoon','evening'] as const).map((period) => <Field key={period} label={t(`onboarding.${period}Energy`)}><input type="range" min="1" max="7" value={dayEnergy[period]} onChange={(e) => setDayEnergy({ ...dayEnergy, [period]: Number(e.target.value) })} className="w-full" /><span className="text-sm font-medium">{dayEnergy[period]}/7</span></Field>)}
        </div>}

        {step === 2 && <div className="mt-7 grid gap-6">
          <Field label={t('onboarding.windowsLabel')}><WeeklyAvailabilityPicker value={availableWindows} onChange={setAvailableWindows} /></Field>
          <div className="space-y-3">{contextItems.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border bg-[#fafaf6] p-3 md:grid-cols-[150px_1fr_110px_110px_110px_40px]">
            <select className="rounded-md border bg-white px-2 text-sm" value={item.type} onChange={(e) => patchContext(item.id, { type: e.target.value as ContextKind })}><option value="fixed_event">{t('onboarding.fixedTime')}</option><option value="recurring_routine">{t('onboarding.routineTime')}</option><option value="flexible_activity">{t('onboarding.flexibleTime')}</option></select>
            <Input value={item.title} onChange={(e) => patchContext(item.id, { title: e.target.value })} placeholder={t('onboarding.activityName')} /><select className="h-10 rounded-md border bg-white px-2 text-sm" value={item.day} onChange={(e) => patchContext(item.id, { day: e.target.value })}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, index) => <option key={day} value={day}>{locale === 'zh' ? ['周一','周二','周三','周四','周五','周六','周日'][index] : day}</option>)}</select><Input type="time" value={item.start} onChange={(e) => patchContext(item.id, { start: e.target.value })} /><Input type="time" value={item.end} onChange={(e) => patchContext(item.id, { end: e.target.value })} /><Button size="icon" variant="ghost" onClick={() => setContextItems((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
          </div>)}<Button variant="outline" onClick={() => setContextItems([...contextItems, initialContext('fixed_event')])}><Plus className="mr-2 h-4 w-4" />{t('onboarding.addActivity')}</Button></div>
          <label className="flex items-center gap-3 rounded-xl border p-4 text-sm"><Checkbox checked={keepBuffer} onCheckedChange={(checked) => setKeepBuffer(checked === true)} /><span><strong>{t('onboarding.bufferLabel')}</strong><span className="block text-muted-foreground">{t('onboarding.bufferHint')}</span></span></label>
        </div>}

        {step === 3 && <div className="mt-7 grid gap-6">
          <Field label={t('onboarding.goalLabel')}><textarea className="min-h-20 w-full rounded-xl border bg-background p-3 text-sm" value={weeklyGoal} onChange={(e) => setWeeklyGoal(e.target.value)} /></Field>
          <div className="space-y-3"><div className="flex items-center justify-between"><div><h3 className="font-medium">{t('onboarding.tasksLabel')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('onboarding.tasksHint')}</p></div><Button variant="outline" size="sm" onClick={() => setTasks([...tasks, initialTask()])}><Plus className="mr-1 h-4 w-4" />{t('onboarding.addTask')}</Button></div>{tasks.map((task, index) => <div key={task.id} className="rounded-2xl border bg-[#fafaf6] p-4">
            <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('onboarding.taskNumber').replace('{number}', String(index + 1))}</span><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={tasks.length === 1} onClick={() => setTasks((items) => items.filter((entry) => entry.id !== task.id))}><Trash2 className="h-4 w-4" /></Button></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('onboarding.taskName')}><Input value={task.title} onChange={(e) => patchTask(task.id, { title: e.target.value })} placeholder={t('onboarding.taskName')} /></Field>
              <Field label={t('onboarding.deadline')}><Input type="datetime-local" value={task.due} onChange={(e) => patchTask(task.id, { due: e.target.value })} /></Field>
              <Field label={t('onboarding.totalWork')}><div className="w-full"><Input type="number" min="15" step="15" value={task.duration} onChange={(e) => patchTask(task.id, { duration: Number(e.target.value) })} /><p className="mt-1 text-xs text-muted-foreground">{t('onboarding.totalWorkHint')}</p></div></Field>
              <Field label={t('onboarding.priority')}><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={task.priority} onChange={(e) => patchTask(task.id, { priority: e.target.value })}><option value="high">{t('taskDialog.priorityHigh')}</option><option value="medium">{t('taskDialog.priorityMedium')}</option><option value="low">{t('taskDialog.priorityLow')}</option></select></Field>
              <Field label={t('onboarding.difficulty')}><div className="w-full"><Input type="number" min="1" max="10" value={task.expected_difficulty} onChange={(e) => patchTask(task.id, { expected_difficulty: Number(e.target.value) })} /><p className="mt-1 text-xs text-muted-foreground">{t('onboarding.difficultyHint')}</p></div></Field>
              <Field label={t('onboarding.dependency')}><Input value={task.dependency} onChange={(e) => patchTask(task.id, { dependency: e.target.value })} placeholder={t('onboarding.dependency')} /></Field>
            </div>
          </div>)}</div>
          <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-4">{(['focus','energy','stress'] as const).map((key) => <Field key={key} label={t(`onboarding.${key}`)}><input type="range" min="1" max="7" value={momentary[key]} onChange={(e) => setMomentary({ ...momentary, [key]: Number(e.target.value) })} className="w-full" /><span className="text-sm">{momentary[key]}/7</span></Field>)}<Field label={t('onboarding.mood')}><Input value={momentary.mood} onChange={(e) => setMomentary({ ...momentary, mood: e.target.value })} /></Field></div>
        </div>}

        <div className="mt-8 flex justify-between border-t pt-5"><Button variant="outline" disabled={step === 0 || loading} onClick={() => setStep(step - 1)}>{t('onboarding.back')}</Button>{step < 3 ? <Button disabled={loading} onClick={() => saveProgress(step + 1)}>{loading ? t('onboarding.saving') : t('onboarding.next')}</Button> : <Button disabled={loading} onClick={finish}>{loading ? t('onboarding.buildingPlan') : t('onboarding.finish')}</Button>}</div>
      </CardContent>
    </Card>
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium text-[#25302a]">{label}<div className="flex items-center gap-3 font-normal text-[#25302a]">{children}</div></label> }
function NumberChoices({ value, values, onChange }: { value: number; values: number[]; onChange: (value: number) => void }) { return <div className="flex flex-wrap gap-2">{values.map((item) => <button type="button" key={item} onClick={() => onChange(item)} className={`rounded-lg border px-3 py-2 text-sm ${value === item ? 'border-primary bg-primary/10 text-primary' : ''}`}>{item} min</button>)}</div> }
function TimeRangeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { const [start = '09:00', end = '17:00'] = String(value || '').split('-'); return <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2"><input aria-label="Start time" type="time" className="h-10 rounded-md border bg-background px-3 text-sm" value={start} onChange={(event) => onChange(`${event.target.value}-${end}`)} /><span className="text-muted-foreground">-</span><input aria-label="End time" type="time" className="h-10 rounded-md border bg-background px-3 text-sm" value={end} onChange={(event) => onChange(`${start}-${event.target.value}`)} /></div> }
