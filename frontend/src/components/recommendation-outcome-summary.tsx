import type { RecommendationEffectSummary } from '@/lib/contracts/execution-contracts'

export function RecommendationOutcomeSummary({ summary, locale }: { summary: RecommendationEffectSummary; locale: string }) {
  const zh = locale === 'zh'
  if (summary.recommendation_count === 0) {
    return <p className="text-sm text-muted-foreground">{zh ? '目前还没有 DSS 建议反馈。' : 'No DSS recommendation feedback yet.'}</p>
  }
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
      <Metric value={summary.accepted_count} label={zh ? '接受建议' : 'Accepted'} />
      <Metric value={summary.rejected_count} label={zh ? '自行选择' : 'Chose differently'} />
      <Metric value={summary.settled_outcome_count} label={zh ? '已有结果' : 'With outcomes'} />
      <Metric value={summary.median_resume_latency_minutes ?? '—'} label={zh ? '典型恢复分钟' : 'Median resume (min)'} />
    </div>
    <div className="grid gap-2 text-xs sm:grid-cols-3">
      <div className="rounded-xl bg-emerald-500/10 p-3">{zh ? '恢复后完成' : 'Completed after resume'}: <strong>{summary.completion.completed}</strong></div>
      <div className="rounded-xl bg-amber-500/10 p-3">{zh ? '恢复后再次中断' : 'Reinterrupted'}: <strong>{summary.reinterrupted_count}</strong></div>
      <div className="rounded-xl bg-muted p-3">{zh ? '结果待观察' : 'Outcome pending'}: <strong>{summary.outcome_pending_count}</strong></div>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{zh ? '这里只汇总建议后观察到的选择和执行结果，不表示建议造成了这些结果，也不会自动更新画像。' : 'These are descriptive choices and outcomes observed after recommendations. They do not imply causation or automatically update the profile.'}</p>
    {summary.recent.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{zh ? '查看最近建议' : 'View recent recommendations'}</summary><div className="mt-3 grid gap-2">{summary.recent.map((item) => <div key={item.recommendation_id} className="rounded-lg border bg-background/70 p-3"><div className="flex justify-between gap-3"><span className="font-medium">{item.recommended_action || '—'}</span><span className="text-muted-foreground">{item.accepted ? (zh ? '已接受' : 'Accepted') : (zh ? '未接受' : 'Not accepted')}</span></div><p className="mt-1 text-muted-foreground">{zh ? '恢复等待' : 'Resume wait'}: {item.resume_latency_minutes ?? '—'} min · {zh ? '结果' : 'Outcome'}: {item.completion || (zh ? '待观察' : 'pending')}</p></div>)}</div></details>}
  </div>
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return <div className="rounded-xl bg-muted p-3"><strong className="block text-xl">{value}</strong><span className="text-[11px] text-muted-foreground">{label}</span></div>
}
