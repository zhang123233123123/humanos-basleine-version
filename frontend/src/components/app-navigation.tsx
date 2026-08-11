'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarDays, CheckSquare2, Clock3, Focus, Lightbulb, Settings2, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageProvider'
import { LanguageSwitch } from '@/components/language-switch'

export function AppNavigation() {
  const pathname = usePathname(); const { locale } = useTranslation(); const [qa, setQa] = useState(false)
  useEffect(() => { fetch('/api/account/capabilities', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((b) => setQa(Boolean(b?.qa_tools))).catch(() => setQa(false)) }, [])
  const items: Array<[string, string, LucideIcon]> = [
    ['/app', locale === 'zh' ? '工作台' : 'Workspace', CalendarDays], ['/app/plan', locale === 'zh' ? '周计划' : 'Weekly Plan', Clock3],
    ['/app/plan#tasks', locale === 'zh' ? '任务' : 'Tasks', CheckSquare2], ['/app/focus', locale === 'zh' ? '专注' : 'Focus', Focus], ['/app/insights', locale === 'zh' ? '洞察' : 'Insights', Lightbulb], ['/app/settings', locale === 'zh' ? '设置' : 'Settings', Settings2],
  ]
  if (qa) items.push(['/app/qa', 'QA', ShieldCheck])
  return <header className="z-50 flex h-14 shrink-0 items-center border-b bg-background/95 px-2 backdrop-blur sm:px-4"><Link href="/app" className="mr-2 shrink-0 font-semibold tracking-[-0.03em] text-foreground sm:mr-6">HumanOS</Link><nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:gap-3">{items.map(([href, label, Icon]) => { const active = href === '/app' ? pathname === href : pathname.startsWith(href.split('#')[0]); return <Link key={href} href={href} aria-label={label} title={label} className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-xs transition sm:px-3 ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="h-4 w-4" /><span className="hidden md:inline">{label}</span></Link> })}</nav><LanguageSwitch /></header>
}
