'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Code2, Database, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DeveloperSnapshot } from '@/lib/contracts/developer-contracts'

type Tab = 'overview' | 'plans' | 'sessions' | 'transitions' | 'tasks' | 'checkin' | 'events'
const sensitivePattern = /password|secret|token|api.?key|authorization/i

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sensitivePattern.test(key) ? '[REDACTED]' : redact(item)]))
}

function stamp(value: unknown) {
  if (!value) return '—'
  const date = new Date(typeof value === 'number' ? value : String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function DeveloperPage() {
  const [snapshot, setSnapshot] = useState<DeveloperSnapshot | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/developer/snapshot', { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`)
      setSnapshot(body)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load developer snapshot')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const activeRevision = snapshot?.profile?.active_plan_revision
  const activeSessions = useMemo(() => snapshot?.execution_sessions.filter((item) => ['ready', 'running', 'paused'].includes(item.status)) || [], [snapshot])

  if (loading && !snapshot) return <main className="grid h-full place-items-center text-sm text-muted-foreground">Loading developer snapshot...</main>
  if (error && !snapshot) return <main className="m-auto max-w-xl rounded-3xl border border-red-200 bg-red-50 p-8 text-red-900"><AlertTriangle className="mb-3 h-8 w-8" /><h1 className="text-2xl font-semibold">Developer access unavailable</h1><p className="mt-2 text-sm">{error}</p></main>
  if (!snapshot) return null

  const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ['plans', 'Plan revisions'], ['sessions', 'Execution sessions'], ['transitions', 'State transitions'], ['tasks', 'Tasks'], ['checkin', 'Daily check-in'], ['events', 'Event log']]
  return <main className="h-full overflow-y-auto bg-[#f3f0e8] px-5 pb-28 pt-7 text-[#18211b]">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#b9b7ad] pb-5"><div><p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-[#4e6857]"><Code2 className="h-4 w-4" />Internal observability</p><h1 className="mt-2 font-serif text-4xl font-semibold">HumanOS Data Inspector</h1><p className="mt-2 font-mono text-xs text-[#667069]">{snapshot.account.email} / snapshot {stamp(snapshot.generated_at)}</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh snapshot</Button></header>
      <nav className="flex gap-2 overflow-x-auto pb-1">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-full px-4 py-2 font-mono text-xs ${tab === value ? 'bg-[#173d2a] text-white' : 'border border-[#c9c7bd] bg-white/60'}`}>{label}</button>)}</nav>
      {tab === 'overview' && <div className="space-y-5"><section className="grid gap-3 md:grid-cols-4"><Metric label="Active revision" value={String(activeRevision ?? '—')} /><Metric label="Plans" value={String(snapshot.plans.length)} /><Metric label="Active sessions" value={String(activeSessions.length)} /><Metric label="Consistency issues" value={String(snapshot.diagnostics.issue_count)} alert={!snapshot.diagnostics.healthy} /></section><section className={`rounded-3xl border p-6 ${snapshot.diagnostics.healthy ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}><h2 className="flex items-center gap-2 text-xl font-semibold">{snapshot.diagnostics.healthy ? <CheckCircle2 className="text-emerald-700" /> : <AlertTriangle className="text-amber-700" />}{snapshot.diagnostics.healthy ? 'Plan, Task and Session fields are aligned' : 'Data consistency requires attention'}</h2><div className="mt-4 space-y-2">{snapshot.diagnostics.issues.map((issue) => <div key={`${issue.code}-${issue.entity_id}`} className="rounded-xl bg-white/70 p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-xs uppercase">{issue.severity}</strong><code>{issue.code}</code><span className="text-muted-foreground">{issue.entity_type}:{issue.entity_id}</span></div><p className="mt-1">{issue.message}</p></div>)}</div></section><JsonPanel title="Profile fields" value={snapshot.profile} /><JsonPanel title="Active plan" value={snapshot.active_plan} /></div>}
      {tab === 'plans' && <RecordList records={snapshot.plans} title={(item) => `Revision ${item.plan_revision ?? '—'} / ${item.plan_status ?? 'unknown'}`} subtitle={(item) => `${item.plan_id ?? ''} · ${item.week_id ?? ''}`} />}
      {tab === 'sessions' && <RecordList records={snapshot.execution_sessions} title={(item) => `${item.task_title || item.title || item.task_id} / ${item.status}`} subtitle={(item) => `revision ${item.plan_revision ?? '—'} · ${stamp(item.planned_start_at)} → ${stamp(item.planned_end_at)}`} />}
      {tab === 'transitions' && <RecordList records={snapshot.state_transitions} title={(item) => `${item.action_json?.type || 'transition'} / ${item.actual_state_json?.execution_status || 'unknown'}`} subtitle={(item) => `task ${item.task_id || '—'} · session ${item.action_json?.execution_session_id || '—'} · ${stamp(item.created_at)}`} />}
      {tab === 'tasks' && <RecordList records={snapshot.tasks} title={(item) => `${item.title || item.id} / ${item.status || 'unknown'}`} subtitle={(item) => `task ${item.id} · updated ${stamp(item.updated_at)}`} />}
      {tab === 'checkin' && <JsonPanel title="Latest runtime state" value={snapshot.latest_runtime_state} />}
      {tab === 'events' && <div className="grid gap-5 lg:grid-cols-2"><RecordList records={snapshot.events} title={(item) => String(item.type || item.id)} subtitle={(item) => stamp(item.created_at)} /><RecordList records={snapshot.plan_edit_events} title={(item) => String(item.event_type || item.id)} subtitle={(item) => `${item.actor || 'unknown'} · ${stamp(item.server_time)}`} /></div>}
    </div>
  </main>
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className="rounded-2xl border border-[#d4d0c4] bg-white/70 p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-[#667069]">{label}</p><p className={`mt-2 text-3xl font-semibold ${alert ? 'text-amber-700' : ''}`}>{value}</p></div> }
function JsonPanel({ title, value }: { title: string; value: unknown }) { return <details className="rounded-2xl border border-[#d4d0c4] bg-white/75 p-5" open><summary className="cursor-pointer font-semibold">{title}</summary><pre className="mt-4 max-h-[34rem] overflow-auto rounded-xl bg-[#152019] p-4 font-mono text-xs leading-6 text-[#c9efd4]">{JSON.stringify(redact(value), null, 2)}</pre></details> }
function RecordList({ records, title, subtitle }: { records: Array<Record<string, any>>; title: (item: Record<string, any>) => string; subtitle: (item: Record<string, any>) => string }) { return <section className="space-y-3">{records.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Database className="mx-auto mb-2 h-5 w-5" />No records</div> : records.map((item, index) => <details key={String(item.id || item.plan_id || item.execution_session_id || index)} className="rounded-2xl border border-[#d4d0c4] bg-white/75 p-4"><summary className="cursor-pointer"><strong>{title(item)}</strong><span className="mt-1 block font-mono text-[11px] text-[#667069]">{subtitle(item)}</span></summary><pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-[#152019] p-4 font-mono text-xs leading-6 text-[#c9efd4]">{JSON.stringify(redact(item), null, 2)}</pre></details>)}</section> }
