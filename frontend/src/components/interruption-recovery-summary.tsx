import type { InterruptionEpisode, InterruptionRecoverySummary as Summary } from '@/lib/contracts/execution-contracts'

export function InterruptionRecoverySummary({ summary, episodes, locale }: { summary: Summary; episodes: InterruptionEpisode[]; locale: string }) {
  const zh = locale === 'zh'
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
      <Metric value={summary.pending_count} label={zh ? '待恢复' : 'Pending'} />
      <Metric value={summary.resumed_count} label={zh ? '恢复尝试' : 'Resume attempts'} />
      <Metric value={summary.settled_count} label={zh ? '已有结果' : 'With outcomes'} />
      <Metric value={summary.median_resume_latency_minutes ?? '—'} label={zh ? '典型等待分钟' : 'Median wait (min)'} />
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{zh ? '这里只展示可观察事实：是否恢复、等待时间及用户报告的结果。它们不自动形成画像，也不表示中断原因造成了结果。' : 'Only observable facts are shown: whether work resumed, wait time, and user-reported outcomes. They do not automatically become traits or imply causation.'}</p>
    {episodes.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{zh ? '查看最近中断记录' : 'View recent interruption episodes'}</summary><div className="mt-3 grid gap-2">{episodes.slice(0, 6).map((episode) => <div key={episode.id} className="rounded-lg border bg-background/70 p-3"><div className="flex justify-between gap-3"><span className="font-medium">{episode.interruption_action}</span><span className="text-muted-foreground">{episode.status}</span></div><p className="mt-1 text-muted-foreground">{episode.pause_reason || (zh ? '未填写原因' : 'No reason')} · {episode.resume_latency_minutes ?? '—'} min</p><p className="mt-1 text-muted-foreground">{zh ? '恢复后执行' : 'Work after resume'}: {episode.outcome.actual_minutes_after_resume ?? '—'} min · {zh ? '画像引用' : 'trait refs'}: {episode.profile_trait_refs.length}</p></div>)}</div></details>}
  </div>
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return <div className="rounded-xl bg-muted p-3"><strong className="block text-xl">{value}</strong><span className="text-[11px] text-muted-foreground">{label}</span></div>
}
