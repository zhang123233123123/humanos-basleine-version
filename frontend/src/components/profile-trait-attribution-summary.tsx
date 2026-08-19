import type { ProfileTraitEffect } from '@/lib/contracts/insights-contracts'

export function ProfileTraitAttributionSummary({ effect, locale }: { effect: ProfileTraitEffect; locale: string }) {
  const zh = locale === 'zh'
  return <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
    <div className="grid grid-cols-3 gap-2 text-center">
      <div><strong className="block text-base">{effect.attribution.independent_count}</strong><span className="text-muted-foreground">{zh ? '独立执行' : 'Independent'}</span></div>
      <div><strong className="block text-base">{effect.attribution.parallel_count}</strong><span className="text-muted-foreground">{zh ? '实际并行' : 'Parallel'}</span></div>
      <div><strong className="block text-base">{effect.attribution.unknown_count}</strong><span className="text-muted-foreground">{zh ? '历史未知' : 'Legacy unknown'}</span></div>
    </div>
    {(effect.attribution.parallel_count > 0 || effect.attribution.unknown_count > 0) && <p className="mt-2 border-t border-blue-500/15 pt-2 leading-5 text-muted-foreground">{zh
      ? '画像匹配判断只使用独立执行结果；实际并行和缺少上下文的历史结果单独保留，不参与失配判断。'
      : 'Trait assessment uses independent outcomes only. Parallel and legacy outcomes without context remain visible but do not drive mismatch decisions.'}</p>}
    {effect.attribution.parallel_count > 0 && <p className="mt-1 text-muted-foreground">{zh ? '并行结果' : 'Parallel outcomes'}: {zh ? '完成' : 'completed'} {effect.parallel_outcomes.completion.completed} · {zh ? '未开始' : 'not started'} {effect.parallel_outcomes.completion.not_started} · {zh ? '时机不合适' : 'timing unhelpful'} {effect.parallel_outcomes.timing_feedback.unhelpful}</p>}
  </div>
}
