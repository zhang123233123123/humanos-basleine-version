'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpenText, BrainCircuit, Check, CheckCircle2, Database, Loader2, LockKeyhole, Pencil, Search, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiRequest } from '@/lib/client/api'
import type { ResourceEnvelope } from '@/lib/contracts/api-contracts'
import type { LearnedPattern, LearningResourceEnvelope, MemoryResult, PatternCandidate } from '@/lib/contracts/insights-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

function confirmedDate(value: string | number | undefined) {
  if (!value) return ''
  const date = new Date(typeof value === 'number' && value < 9999999999 ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

export default function InsightsPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [promoting, setPromoting] = useState('')
  const [candidates, setCandidates] = useState<PatternCandidate[]>([])
  const [learned, setLearned] = useState<LearnedPattern[]>([])
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [memories, setMemories] = useState<MemoryResult[]>([])
  const [recent, setRecent] = useState<MemoryResult[]>([])

  const loadInsights = useCallback(async () => {
    setLoading(true)
    try {
      const [patternData, profileData] = await Promise.all([
        apiRequest<LearningResourceEnvelope<{ patterns: PatternCandidate[] }>>('/api/patterns/candidates'),
        apiRequest<ResourceEnvelope<{ profile: { learned_patterns?: LearnedPattern[] } }>>('/api/profile'),
      ])
      setCandidates(patternData.data.patterns || [])
      setLearned((profileData.data.profile.learned_patterns || []).filter((pattern) => pattern.user_confirmed))
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
    setPromoting(candidate.pattern_label)
    try {
      const result = await apiRequest<LearningResourceEnvelope<{ learned_patterns: LearnedPattern[] }>>('/api/patterns/promote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern_label: candidate.pattern_label,
          evidence_count: candidate.episode_count,
          user_confirmed: true,
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

  const manage = async (action: 'dismiss' | 'forget' | 'edit', patternLabel: string) => {
    const replacement = action === 'edit' ? window.prompt(t('insights.editPrompt'), patternLabel)?.trim() : undefined
    if (action === 'edit' && !replacement) return
    setPromoting(patternLabel)
    try {
      const result = await apiRequest<LearningResourceEnvelope<{ learned_patterns: LearnedPattern[] }>>('/api/patterns/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, pattern_label: patternLabel, replacement_label: replacement }) })
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

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_10%_0%,hsl(var(--primary)/0.14),transparent_34%),radial-gradient(circle_at_90%_24%,hsl(var(--accent)/0.5),transparent_30%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.4))] px-4 pb-28 pt-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <Link href="/app" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />{t('insights.workspace')}</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">HumanOS / Insights</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{t('insights.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('insights.subtitle')}</p>
        </header>

        <Card><CardHeader><CardTitle>{t('insights.recentObservations')}</CardTitle><CardDescription>{t('insights.recentDescription')}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{recent.map((memory) => <article key={memory.memory_id} className="rounded-xl border bg-background/75 p-4"><p className="text-sm leading-relaxed">{memory.text}</p><p className="mt-3 text-xs text-muted-foreground">{memory.source_type} · {confirmedDate(memory.created_at)}</p><details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">{t('insights.technicalDetails')}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify({ score: memory.score, metadata: memory.metadata, evidence_role: memory.evidence_role, plan_write_allowed: memory.plan_write_allowed }, null, 2)}</pre></details></article>)}</CardContent></Card>

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
                return <div key={candidate.pattern_label} className="rounded-xl border bg-background/80 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-medium">{candidate.pattern_label}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.episode_count} {t('insights.episodes')} · {candidate.status}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] ${eligible ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}>{eligible ? t('insights.readyForReview') : t('insights.gatheringEvidence')}</span></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{eligible ? t('insights.confirmationNotice') : t('insights.moreDaysRequired')}</p><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => void manage('dismiss', candidate.pattern_label)} disabled={promoting === candidate.pattern_label}><X className="mr-1 h-3.5 w-3.5" />{t('insights.dismissPattern')}</Button><Button size="sm" disabled={!eligible || alreadyConfirmed || promoting === candidate.pattern_label} onClick={() => promote(candidate)}>{!eligible && <LockKeyhole className="mr-1 h-3.5 w-3.5" />}{alreadyConfirmed ? t('insights.confirmed') : t('insights.confirmPattern')}</Button></div></div></div>
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
