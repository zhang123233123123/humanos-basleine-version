'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiRequest, ApiResponseError } from '@/lib/client/api'
import { requestId } from '@/lib/client/request-id'
import type { EvidenceDeletionImpact, LearningResourceEnvelope, ProfileTraitEvidenceItem, ProfileTraitEvidenceTrace } from '@/lib/contracts/insights-contracts'
import { toast } from 'sonner'

const ROLE_LABELS = {
  supporting: ['支持证据', 'Supporting'], counter: ['反例证据', 'Counter-evidence'],
  execution_outcome_independent: ['独立执行结果', 'Independent outcome'],
  execution_outcome_parallel: ['并行执行结果', 'Parallel outcome'],
  execution_outcome_unknown: ['归因不明的执行结果', 'Outcome with unknown attribution'],
} as const

function EvidenceRecord({ item, locale, deleting, onDelete }: { item: ProfileTraitEvidenceItem; locale: string; deleting: boolean; onDelete: () => void }) {
  const zh = locale === 'zh'
  const role = ROLE_LABELS[item.role]
  const date = new Date(Number(item.observed_at)).toLocaleString(zh ? 'zh-CN' : 'en-US')
  return <article className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-black/10">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">{role[zh ? 0 : 1]}</span>
      <span className="text-stone-500">{item.source_type} · {date}</span>
      {item.user_explicit && <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">{zh ? '用户明确表达' : 'Explicit user report'}</span>}
      {!item.effective && <span className="rounded-full bg-stone-200 px-2 py-1 text-stone-600 dark:bg-white/10 dark:text-stone-300">{zh ? '已失效' : 'Invalidated'}</span>}
    </div>
    <p className="mt-3 text-xs font-medium text-stone-600 dark:text-stone-300">{item.claim_key}</p>
    {item.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.text}</p>}
    <details className="mt-3 text-xs"><summary className="cursor-pointer text-stone-500">{zh ? '查看原始结构化记录' : 'View original structured record'}</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-100 p-3 dark:bg-white/5">{JSON.stringify({ value: item.structured_value, scope: item.scope }, null, 2)}</pre></details>
    <Button className="mt-3" size="sm" variant="ghost" disabled={deleting} onClick={onDelete}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{deleting ? (zh ? '正在删除…' : 'Deleting…') : (zh ? '查看影响并删除' : 'Review impact and delete')}</Button>
  </article>
}

export function ProfileTraitEvidencePanel({ traitId, locale, onDeleted }: { traitId: string; locale: string; onDeleted?: () => Promise<void> | void }) {
  const zh = locale === 'zh'
  const [trace, setTrace] = useState<ProfileTraitEvidenceTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await apiRequest<LearningResourceEnvelope<ProfileTraitEvidenceTrace>>(`/api/profile-traits/${encodeURIComponent(traitId)}/evidence`, { cache: 'no-store' })
      setTrace(result.data)
    } catch (cause) {
      setError(cause instanceof ApiResponseError && cause.status === 401 ? (zh ? '登录状态已失效。' : 'Your session has expired.') : cause instanceof Error ? cause.message : (zh ? '证据加载失败。' : 'Unable to load evidence.'))
    } finally { setLoading(false) }
  }, [traitId, zh])
  useEffect(() => { void load() }, [load])

  const deleteEvidence = useCallback(async (evidence: ProfileTraitEvidenceItem) => {
    setDeleting(evidence.evidence_id)
    try {
      const preview = await apiRequest<LearningResourceEnvelope<EvidenceDeletionImpact>>(`/api/evidence/${encodeURIComponent(evidence.evidence_id)}/impact`, { cache: 'no-store' })
      const affected = preview.data.affected_traits.map((item) => item.display_label).join(zh ? '、' : ', ')
      const message = zh
        ? `删除后，这条证据将从画像学习层永久移除。${affected ? `\n受影响画像：${affected}。` : '\n它当前未关联已确认画像。'}\n原始打卡、对话或执行记录不会被删除，当前计划和已确认画像不会自动改变。\n\n确认删除？`
        : `This permanently removes the evidence from the profile-learning layer.${affected ? `\nAffected traits: ${affected}.` : '\nIt is not currently linked to a confirmed trait.'}\nThe original check-in, conversation, or execution record remains. The active plan and confirmed traits will not change automatically.\n\nDelete this evidence?`
      if (!window.confirm(message)) return
      await apiRequest(`/api/evidence/${encodeURIComponent(evidence.evidence_id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_confirmed: true, request_id: requestId('delete-evidence') }),
      })
      toast.success(zh ? '证据已删除，相关汇总已重新计算。' : 'Evidence deleted and related summaries recalculated.')
      await load()
      await onDeleted?.()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : (zh ? '证据删除失败。' : 'Unable to delete evidence.'))
    } finally { setDeleting('') }
  }, [load, onDeleted, zh])

  if (loading) return <div className="flex items-center gap-2 py-5 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />{zh ? '正在加载证据…' : 'Loading evidence…'}</div>
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm dark:border-red-500/30 dark:bg-red-500/10"><p>{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}><RotateCcw className="mr-2 h-3.5 w-3.5" />{zh ? '重试' : 'Retry'}</Button></div>
  if (!trace) return null
  return <section className="mt-4 border-t border-stone-200 pt-4 dark:border-white/10">
    <div className="flex gap-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{zh ? '以下是这条画像形成与使用过程的证据，只能支持反思，不代表因果关系。并行执行结果不纳入独立效果判断。' : 'These records explain how this trait was formed and used. They support reflection, not causal claims. Parallel outcomes are excluded from independent effect assessment.'}</p></div>
    <p className="mt-3 text-xs text-stone-500">{zh ? `支持 ${trace.summary.supporting_count} · 反例 ${trace.summary.counter_count} · 独立结果 ${trace.summary.independent_outcome_count} · 并行结果 ${trace.summary.parallel_outcome_count}` : `Supporting ${trace.summary.supporting_count} · Counter ${trace.summary.counter_count} · Independent outcomes ${trace.summary.independent_outcome_count} · Parallel outcomes ${trace.summary.parallel_outcome_count}`}</p>
    {trace.summary.missing_evidence_ids.length > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{zh ? `${trace.summary.missing_evidence_ids.length} 条历史证据已删除或不可用。` : `${trace.summary.missing_evidence_ids.length} historical evidence items were deleted or are unavailable.`}</p>}
    {trace.evidence.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed p-5 text-center text-sm text-stone-500">{zh ? '目前没有可展示的证据。' : 'No evidence is currently available.'}</p> : <div className="mt-4 grid gap-3">{trace.evidence.map((item) => <EvidenceRecord key={item.evidence_id} item={item} locale={locale} deleting={deleting === item.evidence_id} onDelete={() => void deleteEvidence(item)} />)}</div>}
  </section>
}
