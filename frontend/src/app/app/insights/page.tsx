'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, BookOpenText, BrainCircuit, Check, CheckCircle2, Clock3, Database, Loader2, LockKeyhole, Pencil, Search, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/client/api'
import type { ResourceEnvelope } from '@/lib/contracts/api-contracts'
import type { LearnedPattern, LearningResourceEnvelope, MemoryResult, PatternCandidate, ProfileTraitEffect } from '@/lib/contracts/insights-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'
import { requestId } from '@/lib/client/request-id'
import { ProfileTraitAttributionSummary } from '@/components/profile-trait-attribution-summary'

function confirmedDate(value: string | number | undefined) {
  if (!value) return ''
  const date = new Date(typeof value === 'number' && value < 9999999999 ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

export default function InsightsPage() {
  const { t, locale } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [promoting, setPromoting] = useState('')
  const [candidates, setCandidates] = useState<PatternCandidate[]>([])
  const [learned, setLearned] = useState<LearnedPattern[]>([])
  const [effects, setEffects] = useState<ProfileTraitEffect[]>([])
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [memories, setMemories] = useState<MemoryResult[]>([])
  const [recent, setRecent] = useState<MemoryResult[]>([])

  const loadInsights = useCallback(async () => {
    setLoading(true)
    try {
      const [patternData, profileData, effectData] = await Promise.all([
        apiRequest<LearningResourceEnvelope<{ patterns: PatternCandidate[] }>>('/api/patterns/candidates'),
        apiRequest<ResourceEnvelope<{ profile: { learned_patterns?: LearnedPattern[] } }>>('/api/profile'),
        apiRequest<LearningResourceEnvelope<{ effects: ProfileTraitEffect[] }>>('/api/profile-traits/effects'),
      ])
      setCandidates(patternData.data.patterns || [])
      setLearned((profileData.data.profile.learned_patterns || []).filter((pattern) => pattern.user_confirmed))
      setEffects(effectData.data.effects || [])
    } catch (error) {
      toast(error instanceof Error ? error.message : t('insights.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadInsights()
  }, [loadInsights])

  useEffect(() => {
    let active = true
    apiRequest<LearningResourceEnvelope<{ memories: MemoryResult[] }>>('/api/memories/search?q=&top_k=6')
      .then((result) => { if (active) setRecent(result.data.memories || []) })
      .catch(() => { if (active) setRecent([]) })
    return () => { active = false }
  }, [])

  const promote = async (candidate: PatternCandidate) => {
    if (candidate.status !== 'candidate' || !candidate.can_suggest_update) return
    setPromoting(candidate.candidate_id)
    try {
      const result = await apiRequest<LearningResourceEnvelope<{ learned_patterns: LearnedPattern[] }>>('/api/patterns/promote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidate.candidate_id,
          pattern_label: candidate.pattern_label,
          evidence_count: candidate.episode_count,
          user_confirmed: true,
          request_id: requestId('pattern-confirm'),
        }),
      })
      setLearned(result.data.learned_patterns.filter((pattern) => pattern.user_confirmed))
      toast(t('insights.patternConfirmed'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('insights.promoteFailed'))
    } finally {
      setPromoting('')
    }
  }

  const decideCandidate = async (action: 'deny' | 'defer', candidate: PatternCandidate) => {
    setPromoting(candidate.candidate_id)
    try {
      await apiRequest<LearningResourceEnvelope<{ decision: Record<string, unknown> }>>('/api/patterns/manage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          candidate_id: candidate.candidate_id,
          pattern_label: candidate.pattern_label,
          request_id: requestId(`pattern-${action}`),
          defer_until: action === 'defer' ? Date.now() + 7 * 24 * 60 * 60 * 1000 : undefined,
        }),
      })
      setCandidates((items) => items.filter((item) => item.candidate_id !== candidate.candidate_id))
      toast(t(action === 'deny' ? 'insights.denySaved' : 'insights.deferSaved'))
    } catch (error) { toast(error instanceof Error ? error.message : t('insights.manageFailed')) }
    finally { setPromoting('') }
  }

  const manage = async (action: 'dismiss' | 'forget' | 'edit', patternLabel: string) => {
    const replacement = action === 'edit' ? window.prompt(t('insights.editPrompt'), patternLabel)?.trim() : undefined
    if (action === 'edit' && !replacement) return
    setPromoting(patternLabel)
    try {
      const result = await apiRequest<LearningResourceEnvelope<{ learned_patterns: LearnedPattern[] }>>('/api/patterns/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, pattern_label: patternLabel, replacement_label: replacement, request_id: requestId(`pattern-${action}`) }) })
      setLearned((result.data.learned_patterns || []).filter((pattern) => pattern.user_confirmed))
      if (action === 'dismiss') setCandidates((items) => items.filter((item) => item.pattern_label !== patternLabel))
      toast(t(`insights.${action}Saved`))
    } catch (error) { toast(error instanceof Error ? error.message : t('insights.manageFailed')) }
    finally { setPromoting('') }
  }

  const searchMemories = async (event: FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const result = await apiRequest<LearningResourceEnvelope<{ memories: MemoryResult[] }>>(`/api/memories/search?q=${encodeURIComponent(query.trim())}&top_k=${topK}`)
      setMemories(result.data.memories || [])
      setSearched(true)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('insights.searchFailed'))
    } finally {
      setSearching(false)
    }
  }

  const reviewTrait = async (effect: ProfileTraitEffect, action: 'keep' | 'later' | 'forget') => {
    if (action === 'forget' && !window.confirm(locale === 'zh' ? '遗忘这条画像？现有计划不会改变，之后的新计划将不再使用它。' : 'Forget this trait? The active plan will stay unchanged, and future plans will stop using it.')) return
    setPromoting(effect.trait_id)
    try {
      await apiRequest<{ data: { review: { action: string } } }>('/api/profile-traits/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trait_id: effect.trait_id, action, request_id: requestId(`trait-review-${action}`),
          defer_until: action === 'later' ? Date.now() + 7 * 24 * 60 * 60 * 1000 : undefined,
        }),
      })
      await loadInsights()
      toast(action === 'keep'
        ? (locale === 'zh' ? '已保留这条画像' : 'Trait kept')
        : action === 'later' ? (locale === 'zh' ? '将在 7 天后再次提醒审查' : 'Review deferred for 7 days')
          : (locale === 'zh' ? '已遗忘这条画像' : 'Trait forgotten'))
    } catch (error) { toast(error instanceof Error ? error.message : (locale === 'zh' ? '保存审查决定失败' : 'Failed to save review decision')) }
    finally { setPromoting('') }
  }

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>

  return (
    <main className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_10%_0%,hsl(var(--primary)/0.14),transparent_34%),radial-gradient(circle_at_90%_24%,hsl(var(--accent)/0.5),transparent_30%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.4))] px-4 pb-28 pt-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <Link href="/app" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('insights.workspace')}</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Insights</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{t('insights.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('insights.subtitle')}</p>
        </header>

        <Card><CardHeader><CardTitle>{t('insights.recentObservations')}</CardTitle><CardDescription>{t('insights.recentDescription')}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{recent.map((memory) => <article key={memory.memory_id} className="rounded-xl border bg-background/75 p-4"><p className="text-sm leading-relaxed">{memory.text}</p><p className="mt-3 text-xs text-muted-foreground">{memory.source_type} · {confirmedDate(memory.created_at)}</p><details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">{t('insights.technicalDetails')}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify({ score: memory.score, metadata: memory.metadata, evidence_role: memory.evidence_role, plan_write_allowed: memory.plan_write_allowed }, null, 2)}</pre></details></article>)}</CardContent></Card>

        <Card>
          <CardHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white"><BarChart3 className="h-5 w-5" /></div><CardTitle>{locale === 'zh' ? '个人节奏的使用结果' : 'Personal rhythm outcomes'}</CardTitle><CardDescription>{locale === 'zh' ? '仅汇总使用该画像后的实际反馈，不代表画像造成了这些结果，也不会自动修改画像。' : 'Descriptive outcomes after a trait was used. These are not causal claims and never update your profile automatically.'}</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {effects.length === 0 && <p className="text-sm text-muted-foreground">{locale === 'zh' ? '目前没有已确认画像或相关执行反馈。' : 'No confirmed traits or linked execution feedback yet.'}</p>}
            {effects.map((effect) => {
              const assessment = {
                insufficient_data: locale === 'zh' ? '样本不足' : 'Not enough data',
                initially_consistent: locale === 'zh' ? '初步一致' : 'Initially consistent',
                mixed: locale === 'zh' ? '结果混合' : 'Mixed results',
                possible_mismatch: locale === 'zh' ? '可能不匹配，建议审查' : 'Possible mismatch; review suggested',
              }[effect.assessment]
              return <article key={effect.trait_id} className="rounded-xl border bg-background/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{effect.pattern_label || effect.trait_key}</p><p className="mt-1 text-xs text-muted-foreground">{effect.usage_with_feedback_count} {locale === 'zh' ? '次独立执行反馈' : 'independent uses with feedback'} · {effect.execution_session_count} Session</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{assessment}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-emerald-500/10 p-2">{locale === 'zh' ? '完成' : 'Completed'}: {effect.completion.completed}<br />{locale === 'zh' ? '部分完成' : 'Partial'}: {effect.completion.partial}</div><div className="rounded-lg bg-violet-500/10 p-2">{locale === 'zh' ? '时机合适' : 'Timing helpful'}: {effect.timing_feedback.helpful}<br />{locale === 'zh' ? '时机不合适' : 'Timing unhelpful'}: {effect.timing_feedback.unhelpful}</div></div><ProfileTraitAttributionSummary effect={effect} locale={locale} />{effect.assessment === 'possible_mismatch' && effect.review_prompt_allowed !== false && <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"><p className="text-xs leading-5">{locale === 'zh' ? '这些独立执行结果可能与当前画像不一致。请由你决定，系统不会自动修改。' : 'These independent outcomes may not match the current trait. You decide; the system will not change it automatically.'}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={promoting === effect.trait_id} onClick={() => void reviewTrait(effect, 'keep')}>{locale === 'zh' ? '继续保留' : 'Keep'}</Button><Button size="sm" variant="outline" disabled={promoting === effect.trait_id} onClick={() => void reviewTrait(effect, 'later')}>{locale === 'zh' ? '稍后再看' : 'Review later'}</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={promoting === effect.trait_id} onClick={() => void reviewTrait(effect, 'forget')}>{locale === 'zh' ? '遗忘画像' : 'Forget'}</Button></div></div>}{effect.assessment === 'possible_mismatch' && effect.review_prompt_allowed === false && effect.latest_review && <p className="mt-3 rounded-lg bg-muted p-2 text-xs text-muted-foreground">{effect.latest_review.action === 'later' ? (locale === 'zh' ? '已暂缓审查，稍后再提醒。' : 'Review deferred; you will be reminded later.') : (locale === 'zh' ? '你已选择继续保留；有新的独立执行反馈时再审查。' : 'You chose to keep this trait; review will return after new independent feedback.')}</p>}<details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">{t('insights.technicalDetails')}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify({ trait_id: effect.trait_id, value: effect.value, evidence_ids: effect.evidence_ids, parallel_evidence_ids: effect.parallel_outcomes.evidence_ids, causal_claim_allowed: effect.causal_claim_allowed, profile_write_allowed: effect.profile_write_allowed }, null, 2)}</pre></details></article>
            })}
          </CardContent>
        </Card>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white"><CheckCircle2 className="h-5 w-5" /></div><CardTitle>{t('insights.confirmedPatterns')}</CardTitle><CardDescription>{t('insights.confirmedDescription')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {learned.length === 0 ? <p className="text-sm text-muted-foreground">{t('insights.noConfirmed')}</p> : learned.map((pattern) => (
                <div key={pattern.pattern_label} className="rounded-xl border bg-background/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{pattern.pattern_label}</p><p className="mt-1 text-xs text-muted-foreground">{t('insights.evidenceCount')}: {pattern.evidence_count}</p></div><Check className="h-5 w-5 text-emerald-600" /></div>{pattern.confirmed_at && <p className="mt-3 text-xs text-muted-foreground">{t('insights.confirmedOn')} {confirmedDate(pattern.confirmed_at)}</p>}<div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => void manage('edit', pattern.pattern_label)} disabled={promoting === pattern.pattern_label}><Pencil className="mr-1 h-3.5 w-3.5" />{t('insights.editPattern')}</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void manage('forget', pattern.pattern_label)} disabled={promoting === pattern.pattern_label}><Trash2 className="mr-1 h-3.5 w-3.5" />{t('insights.forgetPattern')}</Button></div></div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><BrainCircuit className="h-5 w-5" /></div><CardTitle>{t('insights.candidatePatterns')}</CardTitle><CardDescription>{t('insights.candidateDescription')}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {candidates.length === 0 ? <p className="text-sm text-muted-foreground">{t('insights.noCandidates')}</p> : candidates.map((candidate) => {
                const eligible = candidate.status === 'candidate' && candidate.can_suggest_update
                const alreadyConfirmed = learned.some((pattern) => pattern.pattern_label === candidate.pattern_label)
                return <div key={candidate.candidate_id} className="rounded-xl border bg-background/80 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-medium">{candidate.pattern_label}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.episode_count} {t('insights.episodes')} · {candidate.counter_evidence_count} {t('insights.counterEvidence')} · {Math.round(candidate.support_ratio * 100)}%</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] ${eligible ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}>{eligible ? t('insights.readyForReview') : t('insights.gatheringEvidence')}</span></div><details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">{t('insights.technicalDetails')}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify({ candidate_id: candidate.candidate_id, trait_key: candidate.trait_key, proposed_value: candidate.proposed_value, scope: candidate.scope, supporting_evidence_ids: candidate.supporting_evidence_ids, counter_evidence_ids: candidate.counter_evidence_ids }, null, 2)}</pre></details><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{eligible ? t('insights.confirmationNotice') : t('insights.moreDaysRequired')}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => void decideCandidate('deny', candidate)} disabled={promoting === candidate.candidate_id}><X className="mr-1 h-3.5 w-3.5" />{t('insights.denyPattern')}</Button><Button size="sm" variant="outline" onClick={() => void decideCandidate('defer', candidate)} disabled={promoting === candidate.candidate_id}><Clock3 className="mr-1 h-3.5 w-3.5" />{t('insights.deferPattern')}</Button><Button size="sm" disabled={!eligible || alreadyConfirmed || promoting === candidate.candidate_id} onClick={() => promote(candidate)}>{!eligible && <LockKeyhole className="mr-1 h-3.5 w-3.5" />}{alreadyConfirmed ? t('insights.confirmed') : t('insights.confirmPattern')}</Button></div></div></div>
              })}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background"><Database className="h-5 w-5" /></div><CardTitle>{t('insights.memorySearch')}</CardTitle><CardDescription>{t('insights.memoryDescription')}</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <form className="flex flex-col gap-3 md:flex-row" onSubmit={searchMemories}><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('insights.searchPlaceholder')} /></div><select className="h-10 rounded-md border bg-background px-3 text-sm" value={topK} onChange={(event) => setTopK(Number(event.target.value))}><option value={3}>3</option><option value={5}>5</option><option value={10}>10</option></select><Button type="submit" disabled={searching || !query.trim()}>{searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{t('insights.search')}</Button></form>
            {searched && memories.length === 0 && <p className="text-sm text-muted-foreground">{t('insights.noMemories')}</p>}
            <div className="grid gap-3 md:grid-cols-2">{memories.map((memory) => (
              <article key={memory.memory_id} className="rounded-2xl border bg-background/75 p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">{memory.source_type}</span><span className="text-xs font-medium text-primary">{Math.round(memory.score * 100)}%</span></div><p className="mt-3 text-sm leading-relaxed">{memory.text}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">{memory.task_id && <span className="inline-flex items-center gap-1"><BookOpenText className="h-3.5 w-3.5" />{t('insights.taskLinked')}</span>}{typeof memory.metadata?.kind === 'string' && <span>{memory.metadata.kind}</span>}{typeof memory.metadata?.pattern_label === 'string' && <span>{memory.metadata.pattern_label}</span>}<span>{confirmedDate(memory.created_at)}</span></div></article>
            ))}</div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
