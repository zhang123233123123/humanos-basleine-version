'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BrainCircuit, Loader2, Pause, Pencil, Play, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiRequest, ApiResponseError } from '@/lib/client/api'
import { requestId } from '@/lib/client/request-id'
import type { LearningResourceEnvelope, ProfileTraitRecord } from '@/lib/contracts/insights-contracts'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'
import { ProfileTraitAttributionSummary } from '@/components/profile-trait-attribution-summary'

type Filter = 'active' | 'paused' | 'forgotten'

export default function ProfileTraitsPage() {
  const { locale } = useTranslation()
  const c = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale])
  const [traits, setTraits] = useState<ProfileTraitRecord[]>([])
  const [filter, setFilter] = useState<Filter>('active')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [acting, setActing] = useState('')
  const [editing, setEditing] = useState('')
  const [draftLabel, setDraftLabel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await apiRequest<LearningResourceEnvelope<{ profile_traits: ProfileTraitRecord[] }>>('/api/profile-traits', { cache: 'no-store' })
      setTraits(result.data.profile_traits || [])
    } catch (error) {
      setLoadError(error instanceof ApiResponseError && error.status === 401
        ? c('登录状态已失效，请重新登录。', 'Your session has expired. Please sign in again.')
        : error instanceof Error ? error.message : c('画像加载失败', 'Unable to load traits'))
    } finally { setLoading(false) }
  }, [c])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => traits.filter((trait) => filter === 'active'
    ? trait.status === 'confirmed'
    : trait.status === filter), [filter, traits])

  async function manage(trait: ProfileTraitRecord, action: 'edit' | 'pause' | 'resume' | 'forget') {
    if (action === 'forget' && !window.confirm(c('遗忘这条画像？当前活动计划不会改变，未来计划将不再使用它。', 'Forget this trait? Your active plan will stay unchanged and future plans will stop using it.'))) return
    const key = `${trait.trait_id}:${action}`
    setActing(key)
    try {
      await apiRequest(`/api/profile-traits/${encodeURIComponent(trait.trait_id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, display_label: action === 'edit' ? draftLabel.trim() : undefined, request_id: requestId(`trait-${action}`) }),
      })
      setEditing('')
      await load()
      toast.success({ edit: c('画像名称已更新', 'Trait name updated'), pause: c('画像已暂停', 'Trait paused'), resume: c('画像已恢复', 'Trait resumed'), forget: c('画像已遗忘', 'Trait forgotten') }[action])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c('画像操作失败', 'Trait action failed'))
    } finally { setActing('') }
  }

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>

  return <main className="h-full overflow-y-auto bg-[#f3f1eb] pb-24 text-stone-900 dark:bg-[#090d13] dark:text-stone-100">
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
      <Link href="/app/settings" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4" />{c('返回设置', 'Back to settings')}</Link>
      <header className="mt-5 border-b border-stone-300/70 pb-7 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-400">HumanOS profile traits</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold md:text-5xl">{c('画像管理', 'Profile traits')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-400">{c('这些画像只有在你确认后才会成为未来调度的弱先验。暂停、恢复和遗忘都不会静默修改当前活动计划。', 'Traits become weak priors for future scheduling only after your confirmation. Pausing, resuming, or forgetting never silently changes the active plan.')}</p>
      </header>

      {loadError ? <section className="mt-8 rounded-3xl border border-red-300 bg-red-50 p-6 dark:border-red-500/30 dark:bg-red-500/10"><p className="text-sm">{loadError}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RotateCcw className="mr-2 h-4 w-4" />{c('重试', 'Retry')}</Button></section> : <>
        <div className="mt-7 flex flex-wrap gap-2">{(['active', 'paused', 'forgotten'] as Filter[]).map((item) => <Button key={item} variant={filter === item ? 'default' : 'outline'} onClick={() => setFilter(item)}>{item === 'active' ? c('使用中', 'Active') : item === 'paused' ? c('已暂停', 'Paused') : c('已遗忘', 'Forgotten')} ({traits.filter((trait) => item === 'active' ? trait.status === 'confirmed' : trait.status === item).length})</Button>)}</div>
        {visible.length === 0 ? <div className="mt-8 rounded-3xl border border-dashed border-stone-300 p-10 text-center dark:border-white/15"><BrainCircuit className="mx-auto h-8 w-8 text-stone-400" /><p className="mt-3 text-sm text-stone-500">{filter === 'active' ? c('目前没有已确认画像。系统观察不会自动成为画像。', 'There are no confirmed traits. Observations never become traits automatically.') : c('这个分组目前为空。', 'This group is empty.')}</p></div> : <div className="mt-6 grid gap-4">
          {visible.map((trait) => <article key={trait.trait_id} className="rounded-3xl border border-stone-300/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101720] md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0 flex-1">
              {editing === trait.trait_id ? <div className="flex max-w-xl gap-2"><Input value={draftLabel} maxLength={160} onChange={(event) => setDraftLabel(event.target.value)} /><Button disabled={!draftLabel.trim() || acting !== ''} onClick={() => void manage(trait, 'edit')}>{acting ? <Loader2 className="h-4 w-4 animate-spin" /> : c('保存', 'Save')}</Button><Button variant="ghost" onClick={() => setEditing('')}>{c('取消', 'Cancel')}</Button></div> : <><h2 className="text-lg font-semibold">{trait.display_label || trait.trait_key}</h2><p className="mt-1 text-xs text-stone-500">{trait.trait_key} · {trait.confidence_level} · {trait.evidence_ids.length} {c('条证据', 'evidence items')}</p></>}
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-2xl bg-stone-100 p-3 dark:bg-white/5"><span className="text-xs text-stone-500">{c('画像值', 'Trait value')}</span><pre className="mt-1 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(trait.value, null, 2)}</pre></div><div className="rounded-2xl bg-stone-100 p-3 dark:bg-white/5"><span className="text-xs text-stone-500">{c('独立执行反馈', 'Independent execution feedback')}</span><p className="mt-1">{trait.effect ? `${trait.effect.usage_with_feedback_count} ${c('次使用', 'uses')} · ${trait.effect.assessment}` : c('尚无可用效果数据', 'No effect data yet')}</p></div></div>{trait.effect && <ProfileTraitAttributionSummary effect={trait.effect} locale={locale} />}
            </div><div className="flex shrink-0 flex-wrap gap-2">
              {trait.status !== 'forgotten' && <Button size="sm" variant="outline" onClick={() => { setEditing(trait.trait_id); setDraftLabel(trait.display_label || '') }}><Pencil className="mr-1.5 h-3.5 w-3.5" />{c('编辑', 'Edit')}</Button>}
              {trait.status === 'confirmed' && <Button size="sm" variant="outline" disabled={acting !== ''} onClick={() => void manage(trait, 'pause')}><Pause className="mr-1.5 h-3.5 w-3.5" />{c('暂停', 'Pause')}</Button>}
              {trait.status === 'paused' && <Button size="sm" variant="outline" disabled={acting !== ''} onClick={() => void manage(trait, 'resume')}><Play className="mr-1.5 h-3.5 w-3.5" />{c('恢复', 'Resume')}</Button>}
              {trait.status !== 'forgotten' && <Button size="sm" variant="ghost" className="text-destructive" disabled={acting !== ''} onClick={() => void manage(trait, 'forget')}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{c('遗忘', 'Forget')}</Button>}
            </div></div>
          </article>)}
        </div>}
      </>}
    </div>
  </main>
}
