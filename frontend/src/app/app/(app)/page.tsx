'use client'

import { useCallback, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, {
  EventResizeDoneArg,
} from '@fullcalendar/interaction'
import { DatesSetArg, EventDropArg } from '@fullcalendar/core'
import CustomHeader from '@/components/custom-header'
import { ExpandableEvent } from '@/components/expandable-event'
import { ModalProvider, useModal } from '@/hooks/use-modal'
import { useEvents } from '@/hooks/use-events'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/LanguageProvider'
import { WorkspaceSidebar } from '@/components/workspace-sidebar'
import { TaskInspector } from '@/components/task-inspector'
import { TaskReminder } from '@/hooks/use-task-reminders'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  attendees?: { name: string; avatar?: string }[]
  description?: string
  location?: string
  isFlexible?: boolean
}

function TaskInspectorWrapper() {
  const { activeEvent, setActiveEvent, previewTasks, setPreviewTasks } = useModal()
  const { setEvents, refetchEvents, currentStart, currentEnd } = useEvents()
  const { t } = useTranslation()
  const [isConfirmingAll, setIsConfirmingAll] = useState(false)

  const removeFromPreviewTasks = (uniqueId: string) => {
    setPreviewTasks((prev) => prev.filter((t) => t.uniqueId !== uniqueId))
  }

  const handleConfirm = async (task: {
    title: string
    description?: string
    start?: Date | null
    end?: Date | null
    priority?: string
    status?: string
    context?: string
    progress?: string
    nextStep?: string
    openQuestions?: string
  }) => {
    // Remove preview from calendar (use getState for fresh events)
    const previewId = activeEvent?.uniqueId
    if (previewId) {
      setEvents(useEvents.getState().events.filter((e) => e.id !== previewId))
    }

    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        start_at: task.start?.toISOString() || new Date().toISOString(),
        deadline_at: task.end?.toISOString(),
        priority: task.priority || 'medium',
        status: 'scheduled',
        context: task.context || task.description || '',
        progress: task.progress || '',
        next_step: task.nextStep || '',
        open_questions: task.openQuestions || '',
      }),
    })
    toast(t('event.eventUpdated'))
    if (previewId) removeFromPreviewTasks(previewId)
    setActiveEvent(null)
    await refetchEvents(currentStart, currentEnd)
  }

  const handleReject = () => {
    // Remove preview from calendar (use getState for fresh events)
    const previewId = activeEvent?.uniqueId
    if (previewId) {
      setEvents(useEvents.getState().events.filter((e) => e.id !== previewId))
    }
    if (previewId) removeFromPreviewTasks(previewId)
    setActiveEvent(null)
  }

  const handleConfirmPreview = async (task: {
    title: string
    description?: string
    start?: Date | null
    end?: Date | null
    priority?: string
    status?: string
    context?: string
    progress?: string
    nextStep?: string
    openQuestions?: string
    uniqueId: string
  }) => {
    const previewId = task.uniqueId
    if (previewId) {
      setEvents(useEvents.getState().events.filter((e) => e.id !== previewId))
    }

    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        start_at: task.start?.toISOString() || new Date().toISOString(),
        deadline_at: task.end?.toISOString(),
        priority: task.priority || 'medium',
        status: 'scheduled',
        context: task.context || task.description || '',
        progress: task.progress || '',
        next_step: task.nextStep || '',
        open_questions: task.openQuestions || '',
      }),
    })
    toast(t('event.eventUpdated'))
    if (previewId) removeFromPreviewTasks(previewId)
    await refetchEvents(currentStart, currentEnd)
  }

  const handleRejectPreview = (task: { uniqueId: string }) => {
    const previewId = task.uniqueId
    if (previewId) {
      setEvents(useEvents.getState().events.filter((e) => e.id !== previewId))
    }
    if (previewId) removeFromPreviewTasks(previewId)
  }

  const handleConfirmAllPreview = async () => {
    if (previewTasks.length === 0 || isConfirmingAll) return
    setIsConfirmingAll(true)

    const taskList = [...previewTasks]
    const previewIds = new Set(taskList.map((task) => task.uniqueId))
    try {
      if (previewIds.size > 0) {
        setEvents(useEvents.getState().events.filter((e) => !previewIds.has(e.id)))
      }

      await Promise.all(
        taskList.map((task) =>
          fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: task.title,
              start_at: task.start?.toISOString() || new Date().toISOString(),
              deadline_at: task.end?.toISOString(),
              priority: task.priority || 'medium',
              status: 'scheduled',
              context: task.context || task.description || '',
              progress: task.progress || '',
              next_step: task.nextStep || '',
              open_questions: task.openQuestions || '',
            }),
          }),
        ),
      )

      setPreviewTasks([])
      toast(t('workspace.confirmCalendar'))
      await refetchEvents(currentStart, currentEnd)
    } finally {
      setIsConfirmingAll(false)
    }
  }

  const handleSave = async (task: {
    title: string
    description?: string
    start?: Date | null
    end?: Date | null
    priority?: string
    status?: string
    context?: string
    progress?: string
    nextStep?: string
    openQuestions?: string
  }) => {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeEvent?.id,
        title: task.title,
        start_at: task.start?.toISOString(),
        deadline_at: task.end?.toISOString(),
        priority: task.priority,
        status: task.status,
        context: task.context || task.description || '',
        progress: task.progress || '',
        next_step: task.nextStep || '',
        open_questions: task.openQuestions || '',
      }),
    })
    await refetchEvents(currentStart, currentEnd)
  }

  const formatTime = (d: Date | null): string => {
    if (!d) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  // Branch 1: Active task detail view
  if (activeEvent) {
    return (
      <TaskInspector
        task={{
          id: activeEvent.id || activeEvent.uniqueId,
          title: activeEvent.title,
          status: activeEvent.status,
          priority: activeEvent.priority,
          description: activeEvent.description,
          context: activeEvent.context,
          progress: activeEvent.progress,
          nextStep: activeEvent.nextStep,
          openQuestions: activeEvent.openQuestions,
          duration: undefined,
          isPreview: activeEvent.isPreview,
          start: activeEvent.start,
          end: activeEvent.end,
        }}
        onConfirm={activeEvent.isPreview ? handleConfirm : undefined}
        onReject={activeEvent.isPreview ? handleReject : undefined}
        onSave={!activeEvent.isPreview && activeEvent.id ? handleSave : undefined}
      />
    )
  }

  // Branch 2: Preview task list
  if (previewTasks.length > 0) {
    return (
      <aside className="w-72 border-l border-border bg-background overflow-y-auto shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t('workspace.aiGeneratedTasks')}
            </h2>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => void handleConfirmAllPreview()}
              disabled={isConfirmingAll || previewTasks.length === 0}
            >
              {t('workspace.confirmAll')}
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {previewTasks.map((task) => (
            <li
              key={task.uniqueId}
              onClick={() => setActiveEvent(task)}
              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="text-sm font-medium text-foreground truncate">
                {task.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {formatTime(task.start)} - {formatTime(task.end)}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-[11px]"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleConfirmPreview(task)
                  }}
                >
                  {t('workspace.confirmCalendar')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[11px]"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRejectPreview(task)
                  }}
                >
                  {t('workspace.reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    )
  }

  // Branch 3: Empty state
  return <TaskInspector task={null} />
}

function AppContent({
  calendarRef,
  leftOpen,
  setLeftOpen,
  rightOpen,
  setRightOpen,
  chatFocusKey,
  triggerChatFocus,
}: {
  calendarRef: React.RefObject<FullCalendar>
  leftOpen: boolean
  setLeftOpen: (v: boolean) => void
  rightOpen: boolean
  setRightOpen: (v: boolean) => void
  chatFocusKey: number
  triggerChatFocus: () => void
}) {
  const {
    events,
    setEvents,
    refetchEvents,
    isRangeCached,
    setCurrentStart,
    setCurrentEnd,
    currentEnd,
    currentStart,
  } = useEvents()

  const { t } = useTranslation()
  const { setActiveEvent, setPreviewTasks } = useModal()

  const handleDatesSet = useCallback(
    async (arg: DatesSetArg) => {
      const start = arg.startStr
      const end = arg.endStr
      if (start !== currentStart || end !== currentEnd) {
        setCurrentStart(start)
        setCurrentEnd(end)
        if (!isRangeCached(start, end)) {
          await refetchEvents(start, end)
        }
      }
    },
    [isRangeCached, refetchEvents, setCurrentEnd, setCurrentStart, currentStart, currentEnd],
  )

  const handleUpdateEvent = async (event: EventDropArg | EventResizeDoneArg) => {
    // Preview events: just update locally, no API call
    if (event.event.extendedProps.isPreview) return

    const eventData = {
      id: event.event.id,
      start: event.event.start,
      end: event.event.end,
      summary: event.event.title,
      attendees: event.event.extendedProps.attendees,
      description: event.event.extendedProps.description,
    }
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    })
    toast(t('event.eventUpdated'))
  }

  const handleSendMessage = async (message: string) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (res.ok) {
      await refetchEvents(currentStart, currentEnd)
      const data = await res.json()
      // If AI returned tasks, show the first one in the right inspector
      const tasks = data?.turn?.tasks
      if (tasks && tasks.length > 0) {
        const now = new Date()
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0)
        const currentEvents = useEvents.getState().events
        const previewEvents: any[] = []

        // Helper: extract valid ISO date from task fields (server already chrono-parsed text)
        const getStart = (t: any): string | null => {
          const v = t.start_time || t.start_at || t.start
          if (!v) return null
          const d = new Date(v)
          return isNaN(d.getTime()) ? null : d.toISOString()
        }
        const getEnd = (t: any): string | null => {
          const v = t.end_time || t.deadline_at || t.end
          if (!v) return null
          const d = new Date(v)
          return isNaN(d.getTime()) ? null : d.toISOString()
        }

        tasks.forEach((task: any, index: number) => {
          const previewId = 'preview-' + (task.id || `${Date.now()}-${index}`)
          const previewStart = getStart(task)
          const previewEnd = getEnd(task)

          previewEvents.push({
            id: previewId,
            title: task.title || `Task ${index + 1}`,
            start: previewStart || defaultStart.toISOString(),
            end: previewEnd || new Date(defaultStart.getTime() + 3600000).toISOString(),
            allDay: task.all_day || false,
            backgroundColor: 'var(--primary)',
            borderColor: 'var(--primary)',
            textColor: 'white',
            classNames: ['preview-event'],
            extendedProps: {
              description: task.context || '',
              attendees: task.attendees || [],
              status: task.status || 'pending',
              priority: task.priority || 'medium',
              isPreview: true,
              context: task.context || '',
              progress: task.progress || '',
              nextStep: task.next_step || '',
              openQuestions: task.open_questions || '',
            },
          })
        })

        // Add all preview events to calendar
        setEvents([...currentEvents, ...previewEvents])

        // Build ActiveEvent list for all tasks and show in right inspector
        const allPreviewTasks = tasks.map((task: any, index: number) => {
          const taskStart = getStart(task) || defaultStart.toISOString()
          const taskEnd = getEnd(task) || new Date(defaultStart.getTime() + 3600000).toISOString()
          return {
            id: task.id || 'chat-task',
            uniqueId: previewEvents[index].id,
            title: task.title || `Task ${index + 1}`,
            start: new Date(taskStart),
            end: new Date(taskEnd),
            allDay: task.all_day || false,
            timeText: task.due || task.deadline || '',
            description: task.context || data.turn.reply || '',
            attendees: task.attendees || [],
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            isPreview: true,
            context: task.context || '',
            progress: task.progress || '',
            nextStep: task.next_step || '',
            openQuestions: task.open_questions || '',
          }
        })
        setPreviewTasks(allPreviewTasks)
      }
      return data
    }
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <TaskReminder />
      {/* Top bar */}
      <div className="border-b shrink-0">
        <CustomHeader calendarRef={calendarRef} />
      </div>

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {leftOpen && (
          <WorkspaceSidebar
            focusChatTrigger={chatFocusKey}
            onSendMessage={handleSendMessage}
          />
        )}

        {/* Toggle left sidebar */}
        <button
          onClick={() => setLeftOpen(!leftOpen)}
          className="absolute z-40 top-1/2 -translate-y-1/2 rounded-r-md border border-l-0 border-border bg-background px-1 py-3 text-muted-foreground hover:text-foreground transition-colors"
          style={{ left: leftOpen ? 288 : 0 }}
          suppressHydrationWarning
        >
          {leftOpen ? '\u2039\u2039' : '\u203A\u203A'}
        </button>

        {/* Calendar center */}
        <div className="flex-1 overflow-auto p-2">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={false}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            allDaySlot={true}
            events={events}
            height="100%"
            views={{
              timeGridWeek: {
                titleFormat: { year: 'numeric', month: 'short' },
                dayHeaderFormat: { weekday: 'short', day: 'numeric' },
              },
              timeGridDay: {
                titleFormat: { year: 'numeric', month: 'short' },
                dayHeaderFormat: { weekday: 'long', day: 'numeric' },
              },
            }}
            dayHeaderContent={(arg: any) => (
              <>
                <span>
                  {arg.date.toLocaleDateString('en-US', { weekday: 'short' }).replace('.', '')}
                </span>{' '}
                <span>{arg.date.getDate()}</span>
              </>
            )}
            buttonText={{
              today: t('header.today'),
              month: t('header.month'),
              week: t('header.week'),
              day: t('header.day'),
            }}
            nowIndicator
            now={new Date()}
            selectable={false}
            datesSet={handleDatesSet}
            eventContent={function renderEventContent(arg) {
              return <ExpandableEvent {...arg} />
            }}
            editable={true}
            eventDrop={handleUpdateEvent}
            eventResize={handleUpdateEvent}
          />
        </div>

        {/* Toggle right sidebar */}
        <button
          onClick={() => setRightOpen(!rightOpen)}
          className="absolute z-40 top-1/2 -translate-y-1/2 rounded-l-md border border-r-0 border-border bg-background px-1 py-3 text-muted-foreground hover:text-foreground transition-colors"
          style={{ right: rightOpen ? 288 : 0 }}
          suppressHydrationWarning
        >
          {rightOpen ? '\u203A\u203A' : '\u2039\u2039'}
        </button>

        {/* Right Inspector */}
        {rightOpen && <TaskInspectorWrapper />}
      </div>

      {/* Add Task button — focuses chat input */}
      <Button
        className="fixed bottom-6 right-6 rounded-full shadow-lg z-50"
        size="lg"
        onClick={triggerChatFocus}
      >
        <Plus className="w-5 h-5 mr-1" />
        {t('workspace.addTask')}
      </Button>
    </div>
  )
}

export default function AppHome() {
  const calendarRef = useRef<FullCalendar>(null)
  const [chatFocusKey, setChatFocusKey] = useState(0)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  const triggerChatFocus = () => {
    setLeftOpen(true)
    setChatFocusKey((k) => k + 1)
  }

  return (
    <ModalProvider>
      <AppContent
        calendarRef={calendarRef}
        leftOpen={leftOpen}
        setLeftOpen={setLeftOpen}
        rightOpen={rightOpen}
        setRightOpen={setRightOpen}
        chatFocusKey={chatFocusKey}
        triggerChatFocus={triggerChatFocus}
      />
    </ModalProvider>
  )
}
