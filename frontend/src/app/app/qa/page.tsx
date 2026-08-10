'use client'

import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Activity, Clock3, DatabaseBackup, FastForward, RefreshCcw, RotateCcw, ShieldAlert, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import type { CurrentExecution, ExecutionResourceEnvelope } from '@/lib/contracts/execution-contracts'
import type { AccountCapabilities, HumanOSHealth, QAScenario, QAScenarioManifest, QAScenarioRestore, TestClock } from '@/lib/contracts/qa-contracts'

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`)
  return body as T
}

function datetimeLocalValue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function QAPage() {
  const [health, setHealth] = useState<HumanOSHealth | null>(null)
  const [capabilities, setCapabilities] = useState<AccountCapabilities | null>(null)
  const [clock, setClock] = useState<TestClock | null>(null)
  const [current, setCurrent] = useState<CurrentExecution | null>(null)
  const [scenarios, setScenarios] = useState<QAScenario[]>([])
  const [exactTime, setExactTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const nextCapabilities = await jsonRequest<AccountCapabilities>('/api/account/capabilities', { cache: 'no-store' })
      setCapabilities(nextCapabilities)
      if (!nextCapabilities.qa_tools) return
      const [nextHealth, nextClock, nextCurrent] = await Promise.all([
        jsonRequest<HumanOSHealth>('/api/health', { cache: 'no-store' }),
        jsonRequest<TestClock>('/api/test-clock', { cache: 'no-store' }),
        jsonRequest<ExecutionResourceEnvelope<{ current: CurrentExecution }>>('/api/execution-sessions/current', { cache: 'no-store' }),
      ])
      setHealth(nextHealth)
      setClock(nextClock)
      setCurrent(nextCurrent.data.current)
      setExactTime(datetimeLocalValue(nextClock.simulated_now))
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

  async function updateClock(payload: Record<string, string | number | boolean>) {
    setBusy(true)
    try {
      const nextClock = await jsonRequest<TestClock>('/api/test-clock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      setClock(nextClock)
      setExactTime(datetimeLocalValue(nextClock.simulated_now))
      toast.success(payload.use_real_time ? '已恢复真实时间' : '测试时间已更新')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Clock update failed')
    } finally { setBusy(false) }
  }

  async function jumpToNode(kind: 'start' | 'end') {
    const value = kind === 'start' ? current?.session?.planned_start_at : current?.session?.planned_end_at
    if (!value) return toast.error(`当前任务没有计划${kind === 'start' ? '开始' : '结束'}时间`)
    await updateClock({ set_time: value })
  }

  async function restore(path: 'load' | 'reset', scenarioId?: string) {
    setBusy(true)
    try {
      const restored = await jsonRequest<QAScenarioRestore>(`/api/qa-scenarios/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(scenarioId ? { scenario_id: scenarioId } : {}) })
      setClock(restored.clock)
      setExactTime(datetimeLocalValue(restored.clock.simulated_now))
      toast.success(`Loaded scenario: ${restored.scenario.label || restored.scenario.id}`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Scenario restore failed')
    } finally { setBusy(false) }
  }

  if (error) return <main className="m-auto max-w-xl p-8 text-center text-red-600">{error}</main>
  if (!capabilities) return <main className="m-auto p-8 text-neutral-500">正在检查测试权限...</main>
  if (!capabilities.qa_tools) return <main className="m-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-950 shadow-sm"><ShieldAlert className="mb-4 h-9 w-9" /><h1 className="font-serif text-3xl font-semibold">此账号没有测试权限</h1><p className="mt-3 text-sm leading-6">时间节点控制仅向 HumanOS 测试账号开放，普通账号始终使用真实时间。</p></main>
  if (!health || !clock) return <main className="m-auto p-8 text-neutral-500">正在加载测试时钟...</main>

  return (
    <main className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_#dff4e8,_transparent_36%),linear-gradient(135deg,#f7f4ea,#eef5f0)] px-5 pb-28 pt-8 text-stone-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Test account timeline</p><h1 className="font-serif text-4xl font-semibold">时间节点控制台</h1></div><button onClick={() => void load()} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm"><RefreshCcw className="mr-2 inline h-4 w-4" />刷新</button></div>
        <section className="grid gap-4 md:grid-cols-3"><StatusCard icon={<Activity />} label="Account" value="测试账号" /><StatusCard icon={<Clock3 />} label="Current time" value={new Date(clock.simulated_now).toLocaleString()} /><StatusCard icon={<FastForward />} label="Time scale" value={clock.using_real_time ? '真实时间' : `${clock.time_scale}x`} /></section>
        <section className="mt-6 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-serif text-2xl font-semibold">快速调整节点</h2><p className="mt-1 text-sm text-stone-500">每个测试账号拥有独立时钟。调整后，任务开始、暂停和结束均使用该时间。</p></div><button disabled={busy} onClick={() => void updateClock({ use_real_time: true })} className="rounded-full border border-stone-300 px-4 py-2 text-sm disabled:opacity-50"><RotateCcw className="mr-2 inline h-4 w-4" />恢复真实时间</button></div>
          <div className="mt-5 flex flex-wrap gap-3"><ActionButton disabled={busy} onClick={() => void updateClock({ advance_minutes: 5 })}>+5 分钟</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ advance_minutes: 30 })}>+30 分钟</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ advance_minutes: 60 })}>+1 小时</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ advance_days: 1 })}>+1 天</ActionButton><ActionButton disabled={busy} onClick={() => void updateClock({ time_scale: clock.time_scale ? 0 : 60 })}>{clock.time_scale ? '暂停流逝' : '开启 60x'}</ActionButton></div>
          <div className="mt-5 grid gap-3 border-t border-stone-200 pt-5 md:grid-cols-[1fr_auto]"><label className="text-sm font-medium">精确时间<input type="datetime-local" value={exactTime} onChange={(event) => setExactTime(event.target.value)} className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal" /></label><ActionButton disabled={busy || !exactTime} onClick={() => void updateClock({ set_time: exactTime })}>设为此时间</ActionButton></div>
        </section>
        <section className="mt-6 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur"><h2 className="font-serif text-2xl font-semibold">当前任务节点</h2><p className="mt-1 text-sm text-stone-500">{current?.session ? (current.session.task_title || current.session.title || '当前计划任务') : '当前没有可调整的任务'}</p><div className="mt-5 flex flex-wrap gap-3"><ActionButton disabled={busy || !current?.session?.planned_start_at} onClick={() => void jumpToNode('start')}><SkipForward className="mr-2 inline h-4 w-4" />跳到开始</ActionButton><ActionButton disabled={busy || !current?.session?.planned_end_at} onClick={() => void jumpToNode('end')}><SkipForward className="mr-2 inline h-4 w-4" />跳到结束</ActionButton></div></section>
        {health.qa_mode && <section className="mt-6 rounded-3xl bg-stone-950 p-6 text-stone-50 shadow-xl"><div className="flex items-center justify-between gap-4"><div><h2 className="font-serif text-2xl font-semibold">场景快照</h2><p className="mt-1 text-sm text-stone-400">仅在隔离 QA 数据库模式下可用。</p></div><button disabled={busy} onClick={() => void restore('reset')} className="rounded-full border border-stone-700 px-4 py-2 text-sm disabled:opacity-50"><DatabaseBackup className="mr-2 inline h-4 w-4" />重置基础场景</button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{scenarios.map((scenario) => <button key={scenario.id} disabled={busy} onClick={() => void restore('load', scenario.id)} className="rounded-2xl border border-stone-800 bg-stone-900 p-4 text-left transition hover:border-emerald-500 disabled:opacity-50"><strong>{scenario.label || scenario.id}</strong><span className="mt-1 block text-sm text-stone-400">{scenario.description || new Date(scenario.simulated_time).toLocaleString()}</span></button>)}</div></section>}
      </div>
    </main>
  )
}

function StatusCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur"><span className="text-emerald-700">{icon}</span><p className="mt-4 text-xs uppercase tracking-widest text-stone-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>
}

function ActionButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="self-end rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50">{children}</button>
}
