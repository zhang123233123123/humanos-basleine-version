'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarDays, CheckSquare2, Clock3, Lightbulb, Settings2, ShieldCheck } from 'lucide-react'
import { useTranslation } from '@/i18n/LanguageProvider'

export function AppNavigation() {
  const pathname = usePathname(); const { locale } = useTranslation(); const [qa, setQa] = useState(false)
  useEffect(() => { fetch('/api/account/capabilities', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((b) => setQa(Boolean(b?.qa_tools))).catch(() => setQa(false)) }, [])
  const items = [
    ['/app', locale === 'zh' ? '工作台' : 'Workspace', CalendarDays], ['/app/plan', locale === 'zh' ? '周计划' : 'Weekly Plan', Clock3],
    ['/app/plan#tasks', locale === 'zh' ? '任务' : 'Tasks', CheckSquare2], ['/app/insights', locale === 'zh' ? '洞察' : 'Insights', Lightbulb], ['/app/settings', locale === 'zh' ? '设置' : 'Settings', Settings2],
    ...(qa ? [['/app/qa', 'QA', ShieldCheck]] : []),
  ] as const
  return <header className="z-50 flex h-14 shrink-0 items-center border-b bg-[#fbfaf5]/95 px-4 backdrop-blur"><Link href="/app" className="mr-6 font-semibold tracking-[-0.03em] text-[#183326]">HumanOS</Link><nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">{items.map(([href, label, Icon]) => { const active = href === '/app' ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs transition ${active ? 'bg-[#183326] text-white' : 'text-[#657269] hover:bg-[#e8eee8]'}`}><Icon className="h-3.5 w-3.5" />{label}</Link> })}</nav></header>
}
