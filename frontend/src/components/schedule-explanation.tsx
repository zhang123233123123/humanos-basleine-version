'use client'

import { Activity, ChevronDown, ShieldCheck, UserRound } from 'lucide-react'
import type { PlanDecision } from '@/lib/contracts/planning-contracts'

const daypartLabel = (value: string, zh: boolean) => ({
  morning: zh ? '上午' : 'morning', afternoon: zh ? '下午' : 'afternoon',
  evening: zh ? '晚间' : 'evening', night: zh ? '夜间' : 'night',
}[value] || value)

export function ScheduleExplanation({ decision, locale, compact = false }: {
  decision: PlanDecision
  locale: string
  compact?: boolean
}) {
  const zh = locale === 'zh'
  const personalization = decision.personalization || {}
  const applied = personalization.applied_traits || []
  const availableCount = personalization.available_trait_ids?.length || 0
  const hardCount = decision.constraint_summary?.hard_constraints?.length || 0
  const windowCount = decision.constraint_summary?.windows?.length || 0

  return (
    <section className="rounded-xl border bg-muted/20 p-3" aria-label={zh ? '调度依据' : 'Scheduling rationale'}>
      <h3 className="text-sm font-semibold">{zh ? '为什么这样安排' : 'Why this schedule'}</h3>
      <div className={`mt-3 grid gap-2 ${compact ? '' : 'md:grid-cols-3'}`}>
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-700" />{zh ? '硬约束优先' : 'Hard constraints first'}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {zh ? `先满足截止时间、可用时间和固定事项（${windowCount} 个可用窗口，${hardCount} 个固定约束）。` : `Deadlines, availability, and fixed events were applied first (${windowCount} windows, ${hardCount} fixed constraints).`}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><Activity className="h-4 w-4 text-sky-700" />{zh ? '当天状态' : 'Current-day state'}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {personalization.today_state_overrode_traits
              ? (zh ? '今天的自报状态优先，长期节奏没有用于调整今天的时段。' : "Today's self-report took precedence; long-term rhythm did not adjust today's slots.")
              : (zh ? '本次没有当天自报覆盖；计划仍受硬约束限制。' : 'No current-day self-report override was applied; hard constraints still govern the plan.')}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><UserRound className="h-4 w-4 text-violet-700" />{zh ? '已确认的个人节奏' : 'Confirmed personal rhythm'}</div>
          {applied.length > 0 ? applied.map((trait) => (
            <p key={trait.trait_id} className="mt-1 text-xs leading-5 text-muted-foreground">
              {zh
                ? `${daypartLabel(trait.daypart, true)}的${trait.trait_key.endsWith('focus') ? '专注' : '精力'}通常偏${trait.band === 'high' ? '高' : '低'}，仅用于同一可行日期内的时段排序。`
                : `${trait.trait_key.endsWith('focus') ? 'Focus' : 'Energy'} tends to be ${trait.band} in the ${daypartLabel(trait.daypart, false)}; used only to rank slots within the same feasible day.`}
            </p>
          )) : (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {availableCount > 0
                ? (zh ? '有已确认节奏，但本次没有采用；更早日期、当天状态或约束优先。' : 'Confirmed rhythms exist but were not used; earlier dates, current state, or constraints took precedence.')
                : (zh ? '目前没有适用于本次调度的已确认个人节奏。' : 'No confirmed personal rhythm was applicable to this schedule.')}
            </p>
          )}
        </div>
      </div>
      {applied.length > 0 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="flex cursor-pointer items-center gap-1"><ChevronDown className="h-3.5 w-3.5" />{zh ? '查看证据与审计信息' : 'Evidence and audit details'}</summary>
          <div className="mt-2 space-y-1 pl-5">
            {applied.map((trait) => <p key={trait.trait_id}>{trait.trait_id} · {trait.evidence_count || 0} {zh ? '条支持证据' : 'supporting observations'} · {trait.confidence_level || 'medium'}</p>)}
            <p>{zh ? '权限：弱先验，不可覆盖硬约束。' : 'Authority: weak prior; cannot override hard constraints.'}</p>
          </div>
        </details>
      )}
    </section>
  )
}
