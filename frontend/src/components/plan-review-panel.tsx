'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck2, Link2, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/client/api'
import type { ParallelSuggestion, PlanDecision, PlanResourceEnvelope } from '@/lib/contracts/planning-contracts'
import type { HumanOSTask } from '@/lib/contracts/task-contracts'
import { useEvents } from '@/hooks/use-events'

type ParallelChoice = Record<string, 'combine' | 'separate'>

export function PlanReviewPanel() {
  const { refetchEvents } = useEvents()
  const [plan, setPlan] = useState<PlanDecision | null>(null)
  const [tasks, setTasks] = useState<HumanOSTask[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [parallelChoice, setParallelChoice] = useState<ParallelChoice>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [planEnvelope, taskEnvelope] = await Promise.all([
        apiRequest<PlanResourceEnvelope<{ plan: PlanDecision | null }>>('/api/plans/proposed'),
        apiRequest<{ data: { tasks: HumanOSTask[] } }>('/api/tasks'),
      ])
      setPlan(planEnvelope.data.plan)
      setTasks(taskEnvelope.data.tasks || [])
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Plan review unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener('humanos:plan-revision', refresh)
    return () => window.removeEventListener('humanos:plan-revision', refresh)
  }, [load])

  const titles = useMemo(() => new Map(tasks.map((task) => [String(task.id), task.title || 'Untitled'])), [tasks])

  async function waitForPlan(jobId: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 750))
      const status = await apiRequest<any>(`/api/background-jobs?job_id=${encodeURIComponent(jobId)}`)
      const job = status?.data?.job || status?.job
      if (job?.status === 'failed') throw new Error(job.error || 'Parallel plan update failed')
      if (job?.status === 'completed') return
    }
    throw new Error('Parallel plan update timed out')
  }

  async function applyAcceptedParallelSuggestions(sourcePlan: PlanDecision) {
    const accepted = (sourcePlan.parallel_suggestions || []).filter((suggestion) => parallelChoice[suggestion.id] === 'combine')
    if (!accepted.length) return sourcePlan
    const taskPairs = accepted.filter((suggestion) => suggestion.kind !== 'context_activity_pair').map(confirmPair)
    const contextPairs = accepted.filter((suggestion) => suggestion.kind === 'context_activity_pair').map(confirmPair)
    const result = await apiRequest<any>('/api/schedules/decide', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'parallel_review', accepted_parallel_pairs: taskPairs, accepted_parallel_context_pairs: contextPairs }),
    })
    const jobId = result?.data?.job?.job_id || result?.job?.job_id
    if (!jobId) throw new Error('HumanOS could not start the parallel plan update')
    await waitForPlan(jobId)
    const refreshed = await apiRequest<PlanResourceEnvelope<{ plan: PlanDecision | null }>>('/api/plans/proposed')
    if (!refreshed.data.plan) throw new Error('The updated draft could not be loaded')
    return refreshed.data.plan
  }

  const confirm = async () => {
    if (!plan?.plan_id) return
    setConfirming(true)
    try {
      const finalPlan = await applyAcceptedParallelSuggestions(plan)
      const payload = { ...finalPlan, plan_id: finalPlan.plan_id, week_id: finalPlan.week_id, plan_patch: finalPlan.plan_patch || [], unscheduled_tasks: finalPlan.unscheduled_tasks || [] }
      const envelope = await apiRequest<any>('/api/schedules/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const validation = envelope?.validation || envelope?.data?.validation || envelope
      if (validation?.valid === false) {
        const violation = validation.violations?.[0] || {}
        const title = titles.get(String(violation.task_id)) || violation.task_id || 'A task'
        throw new Error(violation.message || `${title} still conflicts with a hard scheduling constraint.`)
      }
      await apiRequest('/api/schedules/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      toast.success('The full plan was added to your calendar')
      setPlan(null)
      await refetchEvents()
      window.dispatchEvent(new CustomEvent('humanos:plan-revision'))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Plan confirmation failed')
    } finally {
      setConfirming(false)
    }
  }

  if (loading) return <aside className="grid w-80 shrink-0 place-items-center border-l bg-background"><Loader2 className="h-5 w-5 animate-spin" /></aside>
  if (error) return <aside className="w-80 shrink-0 border-l bg-background p-4"><div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">{error}<Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div></aside>
  if (!plan) return <aside className="flex w-80 shrink-0 flex-col border-l bg-background p-5"><h2 className="font-semibold">Plan Review</h2><div className="mt-8 rounded-2xl border border-dashed bg-muted/30 p-5 text-center"><CalendarCheck2 className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm">No draft plan is waiting for confirmation</p><Button asChild className="mt-4" size="sm" variant="outline"><Link href="/app/plan">Open weekly plan</Link></Button></div></aside>

  const unscheduled = (plan.unscheduled_tasks || []) as Array<{ task_id?: string; remaining_minutes?: number; reason?: string }>
  return <aside className="flex w-80 shrink-0 flex-col border-l bg-background">
    <div className="border-b p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Review the AI plan</h2><span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{tasks.length} tasks · {unscheduled.length} conflicts</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Review the draft as a whole. You only confirm once.</p>{plan.explanation && <details className="mt-3 rounded-xl border p-3 text-xs"><summary className="cursor-pointer font-medium">Why this plan?</summary><p className="mt-2 leading-5 text-muted-foreground">{plan.explanation}</p></details>}</div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {(plan.parallel_suggestions || []).map((suggestion) => <ParallelDecision key={suggestion.id} suggestion={suggestion} titles={titles} choice={parallelChoice[suggestion.id] || 'separate'} onChoice={(choice) => setParallelChoice((choices) => ({ ...choices, [suggestion.id]: choice }))} />)}
      {(plan.plan_patch || []).map((block, index) => <article key={block.block_id || `${block.task_id}-${index}`} className="mb-2 rounded-xl border border-dashed bg-card p-3"><div className="flex justify-between gap-2"><div><h3 className="text-sm font-medium">{block.title || titles.get(String(block.task_id)) || block.task_id}</h3><p className="mt-1 text-xs text-muted-foreground">Day {Number(block.day_index) + 1} · {formatHour(Number(block.start))}–{formatHour(Number(block.end))}</p></div><Button asChild size="icon" variant="ghost" className="h-7 w-7"><Link href="/app/plan"><Pencil className="h-3.5 w-3.5" /></Link></Button></div></article>)}
      {unscheduled.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800"><div className="mb-2 flex gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />HumanOS needs one decision</div>{unscheduled.map((item) => <div key={String(item.task_id)} className="mt-2 rounded-lg bg-background/70 p-2"><strong>{titles.get(String(item.task_id)) || item.task_id}</strong><p className="mt-1">{item.remaining_minutes || 0} minutes cannot fit before its deadline.</p></div>)}</div>}
    </div>
    <div className="border-t p-4"><Button className="w-full rounded-xl" disabled={confirming || !plan.plan_patch?.length || unscheduled.length > 0} onClick={() => void confirm()}>{confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add plan to calendar</Button><Button asChild variant="ghost" className="mt-2 w-full" size="sm"><Link href="/app/plan">Adjust draft</Link></Button></div>
  </aside>
}

function confirmPair(suggestion: ParallelSuggestion) { return { ...suggestion, user_confirmed: true, status: 'accepted' } }

function ParallelDecision({ suggestion, titles, choice, onChoice }: { suggestion: ParallelSuggestion; titles: Map<string, string>; choice: 'combine' | 'separate'; onChoice: (choice: 'combine' | 'separate') => void }) {
  const primary = suggestion.primary_title || titles.get(String(suggestion.primary_task_id)) || 'Activity 1'
  const secondary = suggestion.secondary_title || titles.get(String(suggestion.secondary_task_id)) || 'Activity 2'
  return <article className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-primary"><Link2 className="h-4 w-4" />Optional parallel suggestion</div><p className="mt-2 text-sm"><strong>{primary}</strong> and <strong>{secondary}</strong> could share {suggestion.suggested_overlap_minutes} minutes.</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" variant={choice === 'combine' ? 'default' : 'outline'} onClick={() => onChoice('combine')}>Combine</Button><Button size="sm" variant={choice === 'separate' ? 'secondary' : 'outline'} onClick={() => onChoice('separate')}>Keep separate</Button></div></article>
}

function formatHour(value: number) { const hours = Math.floor(value); const minutes = Math.round((value - hours) * 60); return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` }
