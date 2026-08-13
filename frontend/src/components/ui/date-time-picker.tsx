'use client'

import { Input } from '@/components/ui/input'

type DateTimePickerProps = {
  value?: string | null
  onChange: (value: string) => void
  className?: string
  min?: string
  ariaLabel?: string
}

function localDateTimeValue(value?: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 16)
  const shifted = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

export function DateTimePicker({ value, onChange, className, min, ariaLabel }: DateTimePickerProps) {
  return <Input type="datetime-local" value={localDateTimeValue(value)} min={min} className={className} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} />
}
