'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { Bot, Brain, Check, ChevronRight, Clock3, Loader2, LockKeyhole, Save, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

type Section = 'account' | 'rhythm' | 'work' | 'ai' | 'privacy'
type Profile = Record<string, any>

const sections: Array<{ id: Section; title: string; description: string; icon: typeof UserRound }> = [
  { id: 'account', title: '账户资料', description: '身份与所在时区', icon: UserRound },
  { id: 'rhythm', title: '时间节律', description: '高效与低能量时段', icon: Clock3 },
  { id: 'work', title: '工作方式', description: '学习方式与计划控制', icon: Brain },
  { id: 'ai', title: 'AI 与记忆', description: '模型、记忆和确认规则', icon: Bot },
  { id: 'privacy', title: '隐私与数据', description: '数据边界和安全状态', icon: LockKeyhole },
]

export default function SettingsPage() {
  const { data: session } = useSession()
  const [section, setSection] = useState<Section>('account')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [health, setHealth] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const [profileResponse, healthResponse] = await Promise.all([
        fetch('/api/profile', { cache: 'no-store' }),
        fetch('/api/health', { cache: 'no-store' }),
      ])
      if (!profileResponse.ok) throw new Error('无法加载设置')
      const profileBody = await profileResponse.json()
      setProfile(profileBody.data?.profile || null)
      if (healthResponse.ok) setHealth(await healthResponse.json())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法加载设置')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  function update(key: string, value: unknown) {
    setSaved(false)
    setProfile((current) => current ? { ...current, [key]: value } : current)
  }

  function updatePreference(key: string, value: unknown) {
    setSaved(false)
    setProfile((current) => current ? { ...current, task_preferences: { ...(current.task_preferences || {}), [key]: value } } : current)
  }

  async function save() {
    if (!profile || saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || '保存失败')
      setProfile(body.data?.profile || null)
      setSaved(true)
      toast.success('设置已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
  if (!profile) return <div className="grid h-full place-items-center text-sm text-muted-foreground">无法加载设置</div>

  return (
    <main className="h-full overflow-y-auto bg-[#f3f1eb] pb-28 text-stone-900 dark:bg-[#090d13] dark:text-stone-100">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <header className="mb-8 flex flex-col gap-4 border-b border-stone-300/70 pb-7 dark:border-white/10 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-400">HumanOS preferences</p><h1 className="mt-2 font-serif text-4xl font-semibold md:text-5xl">设置中心</h1><p className="mt-2 max-w-xl text-sm text-stone-600 dark:text-stone-400">控制 HumanOS 如何理解你的时间、工作方式和个人记忆。</p></div>
          <Button className="h-11 rounded-full px-6" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}{saved ? '已保存' : '保存更改'}</Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <nav className="h-fit overflow-hidden rounded-3xl border border-stone-300/70 bg-white/70 p-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            {sections.map(({ id, title, description, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${section === id ? 'bg-stone-950 text-white shadow-md dark:bg-blue-600' : 'hover:bg-stone-200/70 dark:hover:bg-white/10'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${section === id ? 'bg-white/15' : 'bg-stone-200 dark:bg-white/10'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className={`block truncate text-xs ${section === id ? 'text-white/65' : 'text-stone-500'}`}>{description}</span></span><ChevronRight className="h-4 w-4 opacity-50" /></button>)}
          </nav>

          <section className="min-h-[520px] rounded-3xl border border-stone-300/70 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#101720] md:p-8">
            {section === 'account' && <SettingsSection title="账户资料" description="这些信息用于确定身份语境和所有时间计算。"><Field label="登录邮箱"><Input value={session?.user?.email || profile.user_id || ''} disabled /></Field><Field label="主要角色"><Input value={profile.role || ''} onChange={(event) => update('role', event.target.value)} placeholder="例如：研究生、产品经理" /></Field><Field label="时区"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.timezone || 'Asia/Shanghai'} onChange={(event) => update('timezone', event.target.value)}><option value="Asia/Shanghai">Asia/Shanghai</option><option value="Asia/Hong_Kong">Asia/Hong_Kong</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="America/Los_Angeles">America/Los_Angeles</option></select></Field></SettingsSection>}
            {section === 'rhythm' && <SettingsSection title="时间节律" description="系统会优先把高负荷任务放在你的高效窗口，并保护恢复时间。"><div className="grid gap-5 md:grid-cols-2"><Field label="深度工作窗口" hint="例如 09:00-11:30"><Input value={profile.deep_work_window || ''} onChange={(event) => update('deep_work_window', event.target.value)} /></Field><Field label="低能量窗口" hint="例如 14:00-15:30"><Input value={profile.low_energy_window || ''} onChange={(event) => update('low_energy_window', event.target.value)} /></Field></div><Notice>改变节律后，尚未确认的新计划会使用最新窗口；已确认日历不会被静默修改。</Notice></SettingsSection>}
            {section === 'work' && <SettingsSection title="工作方式" description="决定任务如何拆分、一次安排多长，以及计划变化何时需要确认。"><Field label="偏好学习方式"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.task_preferences?.learning_mode || 'mixed'} onChange={(event) => updatePreference('learning_mode', event.target.value)}><option value="reading">阅读与写作</option><option value="visual">图表与视觉材料</option><option value="discussion">讨论与讲解</option><option value="practice">实践与构建</option><option value="mixed">混合方式</option></select></Field><Field label="偏好专注时长"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.task_preferences?.preferred_session_minutes || 45} onChange={(event) => updatePreference('preferred_session_minutes', Number(event.target.value))}><option value={25}>25 分钟</option><option value={45}>45 分钟</option><option value={60}>60 分钟</option><option value={90}>90 分钟</option></select></Field><Field label="计划控制"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.control_preference || 'confirm_before_reschedule'} onChange={(event) => update('control_preference', event.target.value)}><option value="confirm_before_reschedule">任何调整前都让我确认</option><option value="auto_low_risk">低风险建议可自动安排</option></select></Field></SettingsSection>}
            {section === 'ai' && <SettingsSection title="AI 与记忆" description="查看当前模型能力，以及哪些信息可以成为长期个性化依据。"><div className="grid gap-4 md:grid-cols-2"><Metric label="对话模型" value={health?.ai_model || '规则引擎'} /><Metric label="向量模型" value={health?.embedding_model || '不可用'} /><Metric label="已确认长期规律" value={String((profile.learned_patterns || []).filter((item: any) => item.user_confirmed).length)} /><Metric label="计划模式" value={health?.scheduling_mode || 'constraint_engine_only'} /></div><Notice>候选规律不会自动成为长期偏好。只有你在 Insights 中明确确认后，系统才会使用它。</Notice></SettingsSection>}
            {section === 'privacy' && <SettingsSection title="隐私与数据" description="HumanOS 的个人数据按登录邮箱隔离，计划变化保持可追踪。"><div className="space-y-3"><PrivacyRow title="账户数据隔离" description="任务、计划、状态和记忆查询都绑定当前登录身份。" /><PrivacyRow title="计划修改需确认" description="AI 只生成建议，正式写入日历前需要确认。" /><PrivacyRow title="行为规律需确认" description="系统观察不会自动变成你的长期标签。" /><PrivacyRow title="向量服务降级" description="远程向量服务不可用时切换本地模型，不阻断核心功能。" /></div></SettingsSection>}
          </section>
        </div>
      </div>
    </main>
  )
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <div><div className="mb-7"><h2 className="font-serif text-3xl font-semibold">{title}</h2><p className="mt-2 text-sm text-stone-500">{description}</p></div><div className="space-y-5">{children}</div></div> }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="grid gap-2 text-sm"><span className="flex items-center justify-between font-medium">{label}{hint && <span className="text-xs font-normal text-stone-400">{hint}</span>}</span>{children}</label> }
function Notice({ children }: { children: ReactNode }) { return <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">{children}</div> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-stone-50 p-4 dark:bg-white/5"><p className="text-xs text-stone-500">{label}</p><p className="mt-2 break-words font-medium">{value}</p></div> }
function PrivacyRow({ title, description }: { title: string; description: string }) { return <div className="flex gap-3 rounded-2xl border p-4"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-stone-500">{description}</p></div></div> }
