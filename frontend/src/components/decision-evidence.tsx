import type { HelpDecideRecommendation } from '@/lib/contracts/checkin-contracts'

interface DecisionEvidenceProps {
  evidence: HelpDecideRecommendation['evidence']
  locale: string
}

export function DecisionEvidence({ evidence, locale }: DecisionEvidenceProps) {
  const zh = locale === 'zh'
  const limitationText = (code: string) => {
    if (code === 'user_confirmation_required') return zh ? '这是决策支持建议，执行前仍需你确认。' : 'This is decision support and requires your confirmation.'
    if (code === 'missing_task_deadline') return zh ? '当前没有可用的任务截止时间。' : 'No task deadline was available.'
    if (code === 'no_ready_alternative') return zh ? '当前没有可供比较的已就绪任务。' : 'No ready alternative was available for comparison.'
    if (code.startsWith('missing_self_report:')) {
      const field = code.split(':')[1]
      return zh ? `缺少当下自报数据：${field}` : `Missing current self-report: ${field}`
    }
    return code
  }

  return (
    <details className="rounded-xl border bg-background p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {zh ? '查看这条建议的依据' : 'See evidence for this recommendation'}
        <span className="ml-1 font-normal text-muted-foreground">
          · {evidence.evidence_strength === 'moderate' ? (zh ? '中等证据' : 'Moderate evidence') : (zh ? '有限证据' : 'Limited evidence')}
        </span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {evidence.facts.map((fact, index) => (
          <div key={`${fact.kind}-${fact.field}-${index}`} className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
            <span className="block text-muted-foreground">{fact.kind === 'self_report' ? (zh ? '当下自报' : 'Current self-report') : fact.kind === 'scheduler_state' ? (zh ? '调度状态' : 'Scheduler state') : (zh ? '已保存状态' : 'Persisted state')}</span>
            <span className="font-medium">{fact.field}: {String(fact.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
        {evidence.limitations.map((item, index) => <p key={index}>• {limitationText(item)}</p>)}
      </div>
    </details>
  )
}
