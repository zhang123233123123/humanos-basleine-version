'use client'

import { useEffect } from 'react'
import { useEvents } from '@/hooks/use-events'

export function DraftPlanEventSync() {
  const refetchEvents = useEvents((state) => state.refetchEvents)

  useEffect(() => {
    const refresh = () => void refetchEvents()
    window.addEventListener('humanos:plan-revision', refresh)
    window.addEventListener('humanos:plan-updated', refresh)
    return () => {
      window.removeEventListener('humanos:plan-revision', refresh)
      window.removeEventListener('humanos:plan-updated', refresh)
    }
  }, [refetchEvents])

  return null
}
