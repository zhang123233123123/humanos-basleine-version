'use client'

import { useMemo } from 'react'
import { useTranslation } from '@/i18n/LanguageProvider'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const DAYS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
type WindowValue = { enabled: boolean; start: string; end: string }

function parseValue(value: string): Record<string, WindowValue> {
  const result = Object.fromEntries(DAYS.map((day) => [day, { enabled: false, start: '08:00', end: '21:00' }])) as Record<string, WindowValue>
  const all = value.match(/Monday-Sunday\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i)
  if (all) { for (const day of DAYS) result[day] = { enabled: true, start: all[1], end: all[2] }; return result }
  for (const line of value.split(/\n|;/)) {
    const match = line.trim().match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/i)
    const day = match && DAYS.find((item) => item.toLowerCase() === match[1].toLowerCase())
    if (match && day) result[day] = { enabled: true, start: match[2], end: match[3] }
  }
  return result
}

function serializeValue(windows: Record<string, WindowValue>) {
  return DAYS.filter((day) => windows[day].enabled).map((day) => `${day} ${windows[day].start}-${windows[day].end}`).join('\n')
}

export function WeeklyAvailabilityPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { locale } = useTranslation(); const windows = useMemo(() => parseValue(value), [value])
  const update = (day: string, patch: Partial<WindowValue>) => onChange(serializeValue({ ...windows, [day]: { ...windows[day], ...patch } }))
  return <div className="space-y-2 rounded-xl border p-3">{DAYS.map((day, index) => <div key={day} className="grid grid-cols-[72px_1fr_1fr] items-center gap-2"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={windows[day].enabled} onChange={(event) => update(day, { enabled: event.target.checked })} />{locale === 'zh' ? DAYS_ZH[index] : day.slice(0, 3)}</label><input type="time" disabled={!windows[day].enabled} value={windows[day].start} onChange={(event) => update(day, { start: event.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-40" /><input type="time" disabled={!windows[day].enabled} value={windows[day].end} onChange={(event) => update(day, { end: event.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-40" /></div>)}</div>
}
