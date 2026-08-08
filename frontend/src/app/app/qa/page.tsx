'use client'

import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Activity, Clock3, DatabaseBackup, FastForward, RefreshCcw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { HumanOSHealth, QAScenario, QAScenarioManifest, QAScenarioRestore, TestClock } from '@/lib/contracts/qa-contracts'

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`)
  return body as T
}

export default function QAPage() {
  const [health, setHealth] = useState<HumanOSHealth | null>(null)
  const [clock, setClock] = useState<TestClock | null>(null)
  const [scenarios, setScenarios] = useState<QAScenario[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const nextHealth = await jsonRequest<HumanOSHealth>('/api/health', { cache: 'no-store' })
      setHealth(nextHealth)
      setClock(nextHealth.clock)
      if (nextHealth.qa_mode) {
        const manifest = await jsonRequest<QAScenarioManifest>('/api/qa-scenarios', { cache: 'no-store' })
        setScenarios(manifest.scenarios || [])
      }
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load QA state')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function updateClock(payload: Record<string, number>) {
    setBusy(true)
    try {
      const nextClock = await jsonRequest<TestClock>('/api/test-clock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      setClock(nextClock)
      toast.success('Test clock updated')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Clock update failed')
    } finally { setBusy(false) }
  }

  async function restore(path: 'load' | 'reset', scenarioId?: string) {
    setBusy(true)
    try {
      const restored = await jsonRequest<QAScenarioRestore>(`/api/qa-scenarios/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(scenarioId ? { scenario_id: scenarioId } : {}) })
      setClock(restored.clock)
      toast.success(`Loaded scenario: ${restored.scenario.label || restored.scenario.id}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Scenario restore failed')
    } finally { setBusy(false) }
  }

  if (error) return <main className="m-auto max-w-xl p-8 text-center text-red-600">{error}</main>
  if (!health) return <main className="m-auto p-8 text-neutral-500">Loading QA capabilities...</main>
  if (!health.test_mode) return <main className="m-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-950 shadow-sm"><ShieldAlert className="mb-4 h-9 w-9" /><h1 className="font-serif text-3xl font-semibold">QA controls are disabled</h1><p className="mt-3 text-sm leading-6">This backend is running in production-safe mode. Start an isolated test database with HUMANOS_TEST_MODE=1 to enable clock controls.</p></main>

  return (
    <main className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_#dff4e8,_transparent_36%),linear-gradient(135deg,#f7f4ea,#eef5f0)] px-5 pb-28 pt-8 text-stone-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Isolated testing</p><h1 className="font-serif text-4xl font-semibold">HumanOS QA Console</h1></div><button onClick={() => void load()} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm"><RefreshCcw className="mr-2 inline h-4 w-4" />Refresh</button></div>
        <section className="grid gap-4 md:grid-cols-3"><StatusCard icon={<Activity />} label="Backend" value={health.ok ? 'Available' : 'Unavailable'} /><StatusCard icon={<Clock3 />} label="Simulated time" value={clock ? new Date(clock.simulated_now).toLocaleString() : 'Unavailable'} /><StatusCard icon={<FastForward />} label="Time scale" value={`${clock?.time_scale ?? 0}x`} /></section>
        <section className="mt-6 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur"><h2 className="font-serif text-2xl font-semibold">Test clock</h2><p className="mt-1 text-sm text-stone-500">Week {clock?.week_id}. Time can only move forward unless a scenario snapshot is restored.</p><div className="mt-5 flex flex-wrap gap-3"><ActionButton disabled={busy} onClick={() => void updateClock({ advance_minutes: 30 })}>+30 minutes</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ advance_days: 1 })}>+1 day</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ advance_days: 7 })}>+1 week</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ time_scale: clock?.time_scale ? 0 : 60 })}>{clock?.time_scale ? 'Pause clock' : 'Run at 60x'}</ActionButton></div></section>
        {health.qa_mode && <section className="mt-6 rounded-3xl bg-stone-950 p-6 text-stone-50 shadow-xl"><div className="flex items-center justify-between gap-4"><div><h2 className="font-serif text-2xl font-semibold">Scenario snapshots</h2><p className="mt-1 text-sm text-stone-400">Restoring replaces only the isolated QA database.</p></div><button disabled={busy} onClick={() => void restore('reset')} className="rounded-full border border-stone-700 px-4 py-2 text-sm disabled:opacity-50"><DatabaseBackup className="mr-2 inline h-4 w-4" />Reset base</button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{scenarios.map((scenario) => <button key={scenario.id} disabled={busy} onClick={() => void restore('load', scenario.id)} className="rounded-2xl border border-stone-800 bg-stone-900 p-4 text-left transition hover:border-emerald-500 disabled:opacity-50"><strong>{scenario.label || scenario.id}</strong><span className="mt-1 block text-sm text-stone-400">{scenario.description || new Date(scenario.simulated_time).toLocaleString()}</span></button>)}</div></section>}
      </div>
    </main>
  )
}

function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur"><span className="text-emerald-700">{icon}</span><p className="mt-4 text-xs uppercase tracking-widest text-stone-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>
}

function ActionButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50">{children}</button>
}
