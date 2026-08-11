'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { Bot, Brain, Check, ChevronRight, Clock3, Loader2, LockKeyhole, Save, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/LanguageProvider'

type Section = 'account' | 'rhythm' | 'scheduling' | 'notifications' | 'privacy'
type Profile = Record<string, any>

export default function SettingsPage() {
  const { locale } = useTranslation()
  const c = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale])
  const sections: Array<{ id: Section; title: string; description: string; icon: typeof UserRound }> = [
    { id: 'account', title: c('个人资料', 'Profile'), description: c('身份与所在时区', 'Identity and timezone'), icon: UserRound },
    { id: 'rhythm', title: c('工作节律', 'Working Rhythm'), description: c('高效与低能量时段', 'High and low energy windows'), icon: Clock3 },
    { id: 'scheduling', title: c('计划偏好', 'Scheduling'), description: c('任务拆分与调整控制', 'Sessions and plan control'), icon: Brain },
    { id: 'notifications', title: c('通知', 'Notifications'), description: c('提醒与每日签到', 'Reminders and daily check-in'), icon: Bot },
    { id: 'privacy', title: c('隐私与数据', 'Privacy'), description: c('记忆边界和安全状态', 'Memory boundaries and security'), icon: LockKeyhole },
  ]
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
      if (!profileResponse.ok) throw new Error(c('无法加载设置', 'Unable to load settings'))
      const profileBody = await profileResponse.json()
      setProfile(profileBody.data?.profile || null)
      if (healthResponse.ok) setHealth(await healthResponse.json())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c('无法加载设置', 'Unable to load settings'))
    } finally { setLoading(false) }
  }, [c])

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
      if (!response.ok) throw new Error(body.message || c('保存失败', 'Save failed'))
      setProfile(body.data?.profile || null)
      setSaved(true)
      toast.success(c('设置已保存', 'Settings saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c('保存失败', 'Save failed'))
    } finally { setSaving(false) }
  }

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
  if (!profile) return <div className="grid h-full place-items-center text-sm text-muted-foreground">{c('无法加载设置', 'Unable to load settings')}</div>

  return (
    <main className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[#f3f1eb] pb-28 text-stone-900 dark:bg-[#090d13] dark:text-stone-100">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <header className="mb-8 flex flex-col gap-4 border-b border-stone-300/70 pb-7 dark:border-white/10 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-400">HumanOS preferences</p><h1 className="mt-2 font-serif text-4xl font-semibold md:text-5xl">{c('设置中心', 'Settings')}</h1><p className="mt-2 max-w-xl text-sm text-stone-600 dark:text-stone-400">{c('控制 HumanOS 如何理解你的时间、工作方式和个人记忆。', 'Control how HumanOS understands your time, working style, and personal memory.')}</p></div>
          <Button className="h-11 rounded-full px-6" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}{saved ? c('已保存', 'Saved') : c('保存更改', 'Save changes')}</Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <nav className="h-fit overflow-hidden rounded-3xl border border-stone-300/70 bg-white/70 p-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            {sections.map(({ id, title, description, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${section === id ? 'bg-stone-950 text-white shadow-md dark:bg-blue-600' : 'hover:bg-stone-200/70 dark:hover:bg-white/10'}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${section === id ? 'bg-white/15' : 'bg-stone-200 dark:bg-white/10'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className={`block truncate text-xs ${section === id ? 'text-white/65' : 'text-stone-500'}`}>{description}</span></span><ChevronRight className="h-4 w-4 opacity-50" /></button>)}
          </nav>

          <section className="min-h-[520px] rounded-3xl border border-stone-300/70 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#101720] md:p-8">
            {section === 'account' && <SettingsSection title={c('个人资料', 'Profile')} description={c('这些信息用于确定身份语境和所有时间计算。', 'These fields establish identity context and time calculations.')}><Field label={c('登录邮箱', 'Email')}><Input value={session?.user?.email || profile.user_id || ''} disabled /></Field><Field label={c('主要角色', 'Primary role')}><Input value={profile.role || ''} onChange={(event) => update('role', event.target.value)} placeholder={c('例如：研究生、产品经理', 'e.g. Research student, product manager')} /></Field><Field label={c('时区', 'Timezone')}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.timezone || 'Asia/Shanghai'} onChange={(event) => update('timezone', event.target.value)}><option value="Asia/Shanghai">Asia/Shanghai</option><option value="Asia/Hong_Kong">Asia/Hong_Kong</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="America/Los_Angeles">America/Los_Angeles</option></select></Field></SettingsSection>}
            {section === 'rhythm' && <SettingsSection title={c('工作节律', 'Working Rhythm')} description={c('系统会优先把高负荷任务放在高效窗口，并保护恢复时间。', 'HumanOS prioritizes demanding work in effective windows and protects recovery time.')}><div className="grid gap-5 md:grid-cols-2"><Field label={c('深度工作窗口', 'Deep work window')} hint="09:00-11:30"><Input value={profile.deep_work_window || ''} onChange={(event) => update('deep_work_window', event.target.value)} /></Field><Field label={c('低能量窗口', 'Low-energy window')} hint="14:00-15:30"><Input value={profile.low_energy_window || ''} onChange={(event) => update('low_energy_window', event.target.value)} /></Field></div><Notice>{c('节律变化只用于新提案；已确认日历不会被静默修改。', 'Rhythm changes apply to new proposals only; confirmed calendars are never changed silently.')}</Notice></SettingsSection>}
            {section === 'scheduling' && <SettingsSection title={c('计划偏好', 'Scheduling')} description={c('决定任务如何拆分、一次安排多长，以及调整何时需要确认。', 'Control session splitting, duration, and when changes require confirmation.')}><Field label={c('偏好学习方式', 'Preferred work mode')}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.task_preferences?.learning_mode || 'mixed'} onChange={(event) => updatePreference('learning_mode', event.target.value)}><option value="reading">{c('阅读与写作', 'Reading and writing')}</option><option value="visual">{c('图表与视觉材料', 'Visual material')}</option><option value="discussion">{c('讨论与讲解', 'Discussion')}</option><option value="practice">{c('实践与构建', 'Practice and building')}</option><option value="mixed">{c('混合方式', 'Mixed')}</option></select></Field><Field label={c('偏好专注时长', 'Preferred session length')}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.task_preferences?.preferred_session_minutes || 45} onChange={(event) => updatePreference('preferred_session_minutes', Number(event.target.value))}>{[25,45,60,90].map((minutes) => <option key={minutes} value={minutes}>{minutes} {c('分钟', 'minutes')}</option>)}</select></Field><Field label={c('计划控制', 'Plan control')}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={profile.control_preference || 'confirm_before_reschedule'} onChange={(event) => update('control_preference', event.target.value)}><option value="confirm_before_reschedule">{c('任何调整前都让我确认', 'Confirm every adjustment')}</option><option value="auto_low_risk">{c('低风险建议可自动安排', 'Allow low-risk automatic changes')}</option></select></Field></SettingsSection>}
            {section === 'notifications' && <SettingsSection title={c('通知', 'Notifications')} description={c('控制任务提醒和每日状态询问。', 'Control task reminders and daily state prompts.')}><label className="flex items-center gap-3 rounded-2xl border p-4"><input type="checkbox" checked={profile.task_preferences?.reminders_enabled !== false} onChange={(event) => updatePreference('reminders_enabled', event.target.checked)} /><span><strong className="block text-sm">{c('任务开始提醒', 'Task start reminders')}</strong><span className="text-xs text-stone-500">{c('在计划 Session 即将开始时提醒。', 'Notify when a planned session is about to begin.')}</span></span></label><label className="flex items-center gap-3 rounded-2xl border p-4"><input type="checkbox" checked={profile.task_preferences?.daily_checkin_enabled !== false} onChange={(event) => updatePreference('daily_checkin_enabled', event.target.checked)} /><span><strong className="block text-sm">Daily Check-in</strong><span className="text-xs text-stone-500">{c('每天首次进入时询问当前状态。', 'Ask for current state on the first visit each day.')}</span></span></label></SettingsSection>}
            {section === 'privacy' && <SettingsSection title={c('隐私与数据', 'Privacy')} description={c('个人数据按登录身份隔离，计划变化保持可追踪。', 'Personal data is isolated by identity and plan changes stay traceable.')}><div className="grid gap-4 md:grid-cols-2"><Metric label={c('对话模型', 'Chat model')} value={health?.ai_model || c('规则引擎', 'Rule engine')} /><Metric label={c('向量模型', 'Embedding model')} value={health?.embedding_model || c('不可用', 'Unavailable')} /></div><div className="space-y-3"><PrivacyRow title={c('账户数据隔离', 'Account isolation')} description={c('任务、计划、状态和记忆查询绑定当前身份。', 'Tasks, plans, state, and memories are bound to the current identity.')} /><PrivacyRow title={c('计划修改需确认', 'Plan changes require confirmation')} description={c('AI 只生成建议，正式写入前需要确认。', 'AI proposes changes; confirmation is required before writing.')} /><PrivacyRow title={c('行为规律需确认', 'Patterns require confirmation')} description={c('系统观察不会自动变成长期标签。', 'Observations never become long-term labels automatically.')} /></div></SettingsSection>}
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
