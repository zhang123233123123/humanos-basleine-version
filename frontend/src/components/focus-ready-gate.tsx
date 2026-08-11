'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export function FocusReadyGate() {
  const pathname = usePathname()
  const router = useRouter()
  const redirecting = useRef(false)
  const check = useCallback(async () => {
    if (pathname !== '/app' || redirecting.current || document.visibilityState !== 'visible') return
    try {
      const weekResponse = await fetch('/api/weeks/status', { cache: 'no-store' })
      if (weekResponse.ok && (await weekResponse.json())?.new_week) {
        redirecting.current = true
        router.push('/app/plan?rollover=1')
        return
      }
      const checkinResponse = await fetch('/api/state-checkins', { cache: 'no-store' })
      if (checkinResponse.ok && (await checkinResponse.json())?.required) {
        redirecting.current = true
        router.push('/app/check-in?mode=daily')
        return
      }
      const response = await fetch('/api/execution-sessions/current', { cache: 'no-store' })
      if (!response.ok) return
      const body = await response.json()
      const mode = body?.data?.current?.mode
      if (mode === 'ready_to_start') {
        redirecting.current = true
        router.push('/app/focus?ready=1')
      }
    } catch {
      // Availability errors remain visible on the destination pages; the gate is non-blocking.
    }
  }, [pathname, router])
  useEffect(() => {
    redirecting.current = false
    void check()
    const timer = window.setInterval(check, 30_000)
    const visible = () => { if (document.visibilityState === 'visible') void check() }
    window.addEventListener('focus', check)
    window.addEventListener('humanos:plan-revision', check)
    window.addEventListener('humanos:execution-updated', check)
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('humanos:plan-revision', check); window.removeEventListener('humanos:execution-updated', check); document.removeEventListener('visibilitychange', visible) }
  }, [check])
  return null
}
