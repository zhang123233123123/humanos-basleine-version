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

type ContextKind = 'fixed_event' | 'recurring_routine' | 'flexible_activity'
type ContextItem = { id: string; type: ContextKind; title: string; day: string; start: string; end: string; durationMinutes: number }
type AvailableWindow = { id: string; day: string; start: string; end: string }
type TaskDraft = { id: string; title: string; due: string; duration: number; priority: string; expected_difficulty: number; dependency: string }

const STORAGE_KEY = 'humanos:onboarding-draft:v2'
const STEPS = ['context', 'rhythm', 'week', 'tasks'] as const
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const MOODS = [
  { value: 'great', label: '😊 Great' },
  { value: 'steady', label: '🙂 Okay' },
  { value: 'flat', label: '😐 Flat' },
  { value: 'tired', label: '😴 Tired' },
  { value: 'stressed', label: '😟 Stressed' },
] as const

function stableId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}_${uuid || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`
}

function initialContext(type: ContextKind): ContextItem {
  return { id: stableId('ctx'), type, title: '', day: 'Monday', start: '', end: '', durationMinutes: 45 }
}

function initialWindow(): AvailableWindow {
  return { id: stableId('window'), day: 'Weekdays', start: '', end: '' }
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
  const [availableWindows, setAvailableWindows] = useState<AvailableWindow[]>([initialWindow()])
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
        setDayEnergy(saved.dayEnergy || dayEnergy)
        setAvailableWindows(Array.isArray(saved.availableWindows) ? saved.availableWindows : [initialWindow()])
        setContextItems((saved.contextItems || []).map((item: Partial<ContextItem>) => ({ ...initialContext(item.type || 'fixed_event'), ...item }))); setKeepBuffer(saved.keepBuffer !== false); setWeeklyGoal(saved.weeklyGoal || '')
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
  const patchWindow = (id: string, patch: Partial<AvailableWindow>) => setAvailableWindows((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
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
    const readyWindows = availableWindows.filter((window) => window.start && window.end && window.start < window.end)
    if (readyWindows.length === 0 || !weeklyGoal.trim() || readyTasks.length === 0) {
      toast.error(t('onboarding.requiredError')); return
    }
    setLoading(true)
    try {
      const profileResponse = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...profilePayload(3), research_context: { ...profilePayload(3).research_context, onboarding_completed: true } }) })
      if (!profileResponse.ok) throw new Error(t('onboarding.saveFailed'))

      const weekResponse = await fetch('/api/weekly-setup/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: { ...profilePayload(3), weekly_context: {
            weekly_goal: weeklyGoal,
            weekly_available_windows: windowsAsText(readyWindows),
            available_windows: expandAvailableWindows(readyWindows),
            context_items: normalizeContextItems(contextItems, readyWindows),
            keep_buffer: keepBuffer,
          } },
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

  const selectClass = (selected: boolean) => `rounded-xl border px-3 py-2 text-sm transition ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`

  return <main className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_left,_#eef5e8,_transparent_38%),linear-gradient(135deg,#faf8f1,#f0f4ef)] p-4 pb-12 md:p-10 md:pb-16">
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
          <Field label={t('onboarding.deepWorkLabel')}><TimeRangeInput value={deepWorkWindow} onChange={setDeepWorkWindow} /></Field>
          <Field label={t('onboarding.lowEnergyLabel')}><TimeRangeInput value={lowEnergyWindow} onChange={setLowEnergyWindow} /></Field>
          <Field label={t('onboarding.sessionLengthLabel')}><NumberChoices value={sessionMinutes} values={[25,45,60,90]} onChange={setSessionMinutes} /></Field>
          <Field label={t('onboarding.breakLengthLabel')}><NumberChoices value={breakMinutes} values={[5,10,15,20]} onChange={setBreakMinutes} /></Field>
          {(['morning','afternoon','evening'] as const).map((period) => <Field key={period} label={t(`onboarding.${period}Energy`)}><input type="range" min="1" max="7" value={dayEnergy[period]} onChange={(e) => setDayEnergy({ ...dayEnergy, [period]: Number(e.target.value) })} className="w-full" /><span className="text-sm font-medium">{dayEnergy[period]}/7</span></Field>)}
        </div>}

        {step === 2 && <div className="mt-7 grid gap-6">
          <div className="space-y-3 rounded-2xl border p-4"><div className="flex items-center justify-between"><div><h3 className="font-medium">When may HumanOS schedule work?</h3><p className="text-xs text-muted-foreground">Choose days and times. Use 24-hour time.</p></div><Button variant="outline" size="sm" onClick={() => setAvailableWindows([...availableWindows, initialWindow()])}><Plus className="mr-1 h-4 w-4" />Time range</Button></div>{availableWindows.map((window) => <div key={window.id} className="grid gap-2 md:grid-cols-[160px_1fr_auto_1fr_40px]"><DaySelect value={window.day} includeGroups onChange={(day) => patchWindow(window.id, { day })} /><Input type="time" value={window.start} onChange={(e) => patchWindow(window.id, { start: e.target.value })} /><span className="self-center text-sm text-muted-foreground">to</span><Input type="time" value={window.end} onChange={(e) => patchWindow(window.id, { end: e.target.value })} /><Button size="icon" variant="ghost" disabled={availableWindows.length === 1} onClick={() => setAvailableWindows((items) => items.filter((entry) => entry.id !== window.id))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
          <div className="space-y-3"><div><h3 className="font-medium">What already uses some of that time?</h3><p className="text-xs text-muted-foreground">Cannot move = meetings; Usually around this time = routines; HumanOS may choose the time = flexible activities.</p></div>{contextItems.map((item) => <div key={item.id} className={`grid gap-2 rounded-xl border bg-[#fafaf6] p-3 ${item.type === 'flexible_activity' ? 'md:grid-cols-[180px_1fr_150px_40px]' : 'md:grid-cols-[180px_1fr_140px_1fr_1fr_40px]'}`}>
            <select className="rounded-md border bg-white px-2 text-sm" value={item.type} onChange={(e) => patchContext(item.id, { type: e.target.value as ContextKind })}><option value="fixed_event">{t('onboarding.fixedTime')}</option><option value="recurring_routine">{t('onboarding.routineTime')}</option><option value="flexible_activity">{t('onboarding.flexibleTime')}</option></select>
            <Input value={item.title} onChange={(e) => patchContext(item.id, { title: e.target.value })} placeholder={t('onboarding.activityName')} />{item.type === 'flexible_activity' ? <label className="flex items-center gap-2 rounded-md border bg-white px-3"><Input className="border-0 px-0 shadow-none" type="number" min="15" step="15" value={item.durationMinutes} onChange={(e) => patchContext(item.id, { durationMinutes: Number(e.target.value) })} /><span className="text-xs text-muted-foreground">min</span></label> : <><DaySelect value={item.day} includeEveryDay={item.type === 'recurring_routine'} onChange={(day) => patchContext(item.id, { day })} /><Input type="time" value={item.start} onChange={(e) => patchContext(item.id, { start: e.target.value })} /><Input type="time" value={item.end} onChange={(e) => patchContext(item.id, { end: e.target.value })} /></>}<Button size="icon" variant="ghost" onClick={() => setContextItems((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
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
              <Field label={t('onboarding.difficulty')}><div className="flex w-full items-center gap-3"><input className="w-full" type="range" min="1" max="7" value={task.expected_difficulty} onChange={(e) => patchTask(task.id, { expected_difficulty: Number(e.target.value) })} /><span className="min-w-8 text-sm font-medium">{task.expected_difficulty}/7</span></div></Field>
              <Field label={t('onboarding.dependency')}><Input value={task.dependency} onChange={(e) => patchTask(task.id, { dependency: e.target.value })} placeholder={t('onboarding.dependency')} /></Field>
            </div>
          </div>)}</div>
          <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-4">{(['focus','energy','stress'] as const).map((key) => <Field key={key} label={t(`onboarding.${key}`)}><input type="range" min="1" max="7" value={momentary[key]} onChange={(e) => setMomentary({ ...momentary, [key]: Number(e.target.value) })} className="w-full" /><span className="text-sm">{momentary[key]}/7</span></Field>)}<Field label={t('onboarding.mood')}><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={momentary.mood} onChange={(e) => setMomentary({ ...momentary, mood: e.target.value })}>{MOODS.map((mood) => <option key={mood.value} value={mood.value}>{mood.label}</option>)}</select></Field></div>
        </div>}

        <div className="mt-8 flex justify-between border-t pt-5"><Button variant="outline" disabled={step === 0 || loading} onClick={() => setStep(step - 1)}>{t('onboarding.back')}</Button>{step < 3 ? <Button disabled={loading} onClick={() => saveProgress(step + 1)}>{loading ? t('onboarding.saving') : t('onboarding.next')}</Button> : <Button disabled={loading} onClick={finish}>{loading ? t('onboarding.buildingPlan') : t('onboarding.finish')}</Button>}</div>
      </CardContent>
    </Card>
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium">{label}<div className="flex items-center gap-3 font-normal">{children}</div></label> }
function NumberChoices({ value, values, onChange }: { value: number; values: number[]; onChange: (value: number) => void }) { return <div className="flex flex-wrap gap-2">{values.map((item) => <button type="button" key={item} onClick={() => onChange(item)} className={`rounded-lg border px-3 py-2 text-sm ${value === item ? 'border-primary bg-primary/10 text-primary' : ''}`}>{item} min</button>)}</div> }

function TimeRangeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [start = '', end = ''] = value.split('-')
  return <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2"><Input type="time" value={start} onChange={(event) => onChange(`${event.target.value}-${end}`)} /><span className="text-muted-foreground">to</span><Input type="time" value={end} onChange={(event) => onChange(`${start}-${event.target.value}`)} /></div>
}

function DaySelect({ value, onChange, includeGroups = false, includeEveryDay = false }: { value: string; onChange: (value: string) => void; includeGroups?: boolean; includeEveryDay?: boolean }) {
  return <select className="h-10 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{includeGroups && <option value="Weekdays">Weekdays</option>}{includeGroups && <option value="Weekend">Weekend</option>}{includeEveryDay && <option value="Every day">Every day</option>}{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select>
}

function clockToHour(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours + minutes / 60
}

function selectedDayIndexes(day: string) {
  if (day === 'Weekdays') return [0, 1, 2, 3, 4]
  if (day === 'Weekend') return [5, 6]
  if (day === 'Every day') return [0, 1, 2, 3, 4, 5, 6]
  const index = DAYS.indexOf(day as typeof DAYS[number])
  return index >= 0 ? [index] : []
}

function expandAvailableWindows(windows: AvailableWindow[]) {
  return windows.flatMap((window) => selectedDayIndexes(window.day).map((dayIndex) => ({ id: `${window.id}_${dayIndex}`, day_index: dayIndex, start: clockToHour(window.start), end: clockToHour(window.end), source: 'user_selected' })))
}

function windowsAsText(windows: AvailableWindow[]) {
  return windows.map((window) => `${window.day} ${window.start}-${window.end}`).join('; ')
}

function normalizeContextItems(items: ContextItem[], windows: AvailableWindow[]) {
  const availableDays = Array.from(new Set(expandAvailableWindows(windows).map((window) => window.day_index)))
  const normalized: Array<Record<string, unknown>> = []
  items.filter((item) => item.title.trim()).forEach((item) => {
    const days = item.type === 'flexible_activity' ? availableDays : selectedDayIndexes(item.day)
    const common = { id: item.id, type: item.type, category: item.type, title: item.title.trim(), day: item.type === 'flexible_activity' ? 'Any available day' : item.day, days, confirmed: true, confidence: 'high', source: 'onboarding' }
    if (item.type === 'flexible_activity') normalized.push({ ...common, duration_minutes: Math.max(15, Number(item.durationMinutes) || 45), occurrence_mode: 'once_this_week' })
    else if (item.start && item.end && item.start < item.end) normalized.push({ ...common, start: clockToHour(item.start), end: clockToHour(item.end), duration_minutes: Math.round((clockToHour(item.end) - clockToHour(item.start)) * 60), shift_minutes: item.type === 'recurring_routine' ? 30 : 0 })
  })
  return normalized
}
