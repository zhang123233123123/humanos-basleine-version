'use client'

import { useEffect, useRef } from 'react'
import { useEvents } from '@/hooks/use-events'
import { useModal } from '@/hooks/use-modal'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

export function TaskReminder() {
  const { events } = useEvents()
  const { setActiveEvent } = useModal()
  const { t } = useTranslation()
  const remindedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const fiveMinutes = 5 * 60 * 1000

      events.forEach((event: any) => {
        const eventId = event.id
        if (!eventId || remindedRef.current.has(eventId)) return

        const startTime = event.start ? new Date(event.start).getTime() : null
        if (!startTime || isNaN(startTime)) return

        const diff = startTime - now

        // Task starts within 5 minutes and hasn't started yet
        if (diff > 0 && diff <= fiveMinutes) {
          remindedRef.current.add(eventId)

          const minutesLeft = Math.max(1, Math.ceil(diff / 60000))
          const startsInText = t('reminder.startsIn').replace('{n}', String(minutesLeft))

          // Browser notification
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(t('reminder.upcoming'), {
              body: `${event.title} — ${startsInText}`,
              icon: '/favicon.ico',
            })
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission()
          }

          // Toast with view button
          toast(`${t('reminder.upcoming')}: ${event.title}`, {
            description: startsInText,
            action: {
              label: t('reminder.viewTask'),
              onClick: () => setActiveEvent({
                id: event.id,
                uniqueId: event.id,
                title: event.title || '',
                start: event.start ? new Date(event.start) : null,
                end: event.end ? new Date(event.end) : null,
                allDay: event.allDay || false,
                timeText: '',
                description: event.extendedProps?.description || '',
                attendees: event.extendedProps?.attendees || [],
                status: event.extendedProps?.status || 'pending',
                priority: event.extendedProps?.priority || 'medium',
                context: event.extendedProps?.context || '',
                progress: event.extendedProps?.progress || '',
                nextStep: event.extendedProps?.nextStep || '',
                openQuestions: event.extendedProps?.openQuestions || '',
              }),
            },
            duration: 10000,
          })
        }

        // Clean up: if event has already passed (more than 5 min ago), remove from reminded set
        if (diff < -fiveMinutes) {
          remindedRef.current.delete(eventId)
        }
      })
    }, 30000)

    return () => clearInterval(interval)
  }, [events, setActiveEvent, t])

  // This component does not render anything
  return null
}
