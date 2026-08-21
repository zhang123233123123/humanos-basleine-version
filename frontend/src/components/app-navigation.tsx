'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Focus, Lightbulb, ListTodo, LogOut, Settings2, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useTranslation } from '@/i18n/LanguageProvider'
import { LanguageSwitch } from '@/components/language-switch'

export function AppNavigation() {
  const pathname = usePathname(); const { locale } = useTranslation(); const { data: session } = useSession(); const [qa, setQa] = useState(false)
  useEffect(() => { fetch('/api/account/capabilities', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((b) => setQa(Boolean(b?.qa_tools))).catch(() => setQa(false)) }, [])
  const items: Array<[string, string, LucideIcon]> = [
    ['/app', locale === 'zh' ? '工作台' : 'Workspace', CalendarDays], ['/app/plan', locale === 'zh' ? '周计划' : 'Weekly Plan', Clock3], ['/app/tasks', locale === 'zh' ? '任务' : 'Tasks', ListTodo],
    ['/app/focus', locale === 'zh' ? '专注' : 'Focus', Focus], ['/app/insights', locale === 'zh' ? '洞察' : 'Insights', Lightbulb], ['/app/settings', locale === 'zh' ? '设置' : 'Settings', Settings2],
  ]
  if (qa) items.push(['/app/qa', 'QA', ShieldCheck])
  const email = session?.user?.email || ''
  const accountLabel = session?.user?.name || email || (locale === 'zh' ? '账户' : 'Account')
  return <header className="z-50 flex h-14 shrink-0 items-center border-b bg-background/95 px-2 backdrop-blur sm:px-4"><Link href="/app" className="mr-2 shrink-0 font-semibold tracking-[-0.03em] text-foreground sm:mr-6">HumanOS</Link><nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:gap-3">{items.map(([href, label, Icon]) => { const active = href === '/app' ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} aria-label={label} title={label} className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-xs transition sm:px-3 ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="h-4 w-4" /><span className="hidden md:inline">{label}</span></Link> })}</nav><div className="ml-2 flex shrink-0 items-center gap-1"><LanguageSwitch /><details className="group relative"><summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border bg-card text-foreground shadow-sm transition hover:border-primary/50 hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label={locale === 'zh' ? '打开账户菜单' : 'Open account menu'} title={accountLabel}><UserRound className="h-4 w-4" /></summary><div className="absolute right-0 top-11 z-[80] w-64 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl"><div className="border-b bg-muted/30 px-4 py-3"><p className="truncate text-sm font-semibold">{accountLabel}</p>{email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}</div><div className="p-2"><Link href="/app/settings" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted"><Settings2 className="h-4 w-4" />{locale === 'zh' ? '账户与设置' : 'Account & Settings'}</Link><button type="button" onClick={() => void signOut({ callbackUrl: '/login' })} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"><LogOut className="h-4 w-4" />{locale === 'zh' ? '退出登录' : 'Sign out'}</button></div></div></details></div></header>
}
