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
import { useModal } from '@/hooks/use-modal'
import { useEvents } from '@/hooks/use-events'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/LanguageProvider'
import { WorkspaceSidebar } from '@/components/workspace-sidebar'
import { TaskInspector } from '@/components/task-inspector'
import { PlanReviewPanel } from '@/components/plan-review-panel'
import { TaskReminder } from '@/hooks/use-task-reminders'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { useRouter } from 'next/navigation'
import type { ExecutionResourceEnvelope, ExecutionSession } from '@/lib/contracts/execution-contracts'
import type { PlanDecision, PlanResourceEnvelope } from '@/lib/contracts/planning-contracts'
import { requestId } from '@/lib/client/request-id'

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
  const router = useRouter()
  const { activeEvent, setActiveEvent, previewTasks, setPreviewTasks } = useModal()
  const { setEvents, refetchEvents, currentStart, currentEnd } = useEvents()
  const { t } = useTranslation()
  const [isConfirmingAll, setIsConfirmingAll] = useState(false)
  const [showBatchReason, setShowBatchReason] = useState(false)
  const [batchReason, setBatchReason] = useState('')
  const [proposalError, setProposalError] = useState('')
  const [proposalRetrying, setProposalRetrying] = useState(false)

  const removeFromPreviewTasks = (uniqueId: string) => {
    setPreviewTasks((prev) => prev.filter((t) => t.uniqueId !== uniqueId))
  }

  const openScheduleProposal = async (source: string) => {
    setProposalRetrying(true)
    setProposalError('')
    try {
      const proposal = await apiRequest<{ decision: PlanDecision }>('/api/schedules/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_now: new Date().toISOString(), source }),
      })
      if (proposal.decision?.unavailable || proposal.decision?.error) {
        throw new Error(proposal.decision.error || 'The scheduling service could not generate a plan preview')
      }
      router.push('/app/plan?proposal=latest')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The scheduling service could not generate a plan preview'
      setProposalError(message)
      throw error
    } finally {
      setProposalRetrying(false)
    }
  }

  const retryScheduleProposal = async () => {
    try {
      await openScheduleProposal('manual_schedule_retry')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Unable to regenerate the schedule preview')
    }
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
    duration?: number
    deadlineAt?: string
    due?: string
  }) => {
    const previewId = activeEvent?.uniqueId
    await apiRequest('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        deadline_at: task.deadlineAt || task.end?.toISOString(),
        due: task.due,
        duration: task.duration,
        estimated_duration: task.duration,
        priority: task.priority || 'medium',
        status: 'queued',
        context: task.context || task.description || '',
        progress: task.progress || '',
        next_step: task.nextStep || '',
        open_questions: task.openQuestions || '',
      }),
    })
    if (previewId) {
      setEvents(useEvents.getState().events.filter((event) => event.id !== previewId))
      removeFromPreviewTasks(previewId)
    }
    toast(t('event.eventUpdated'))
    setActiveEvent(null)
    await refetchEvents(currentStart, currentEnd)
    await openScheduleProposal('single_task_confirmation')
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
    duration?: number
    deadlineAt?: string
    due?: string
  }) => {
    const previewId = task.uniqueId
    if (previewId) {
      setEvents(useEvents.getState().events.filter((e) => e.id !== previewId))
    }

    await apiRequest('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        deadline_at: task.deadlineAt || task.end?.toISOString(),
        due: task.due,
        duration: task.duration,
        estimated_duration: task.duration,
        priority: task.priority || 'medium',
        status: 'queued',
        context: task.context || task.description || '',
        progress: task.progress || '',
        next_step: task.nextStep || '',
        open_questions: task.openQuestions || '',
      }),
    })
    toast(t('event.eventUpdated'))
    if (previewId) removeFromPreviewTasks(previewId)
    await refetchEvents(currentStart, currentEnd)
    await openScheduleProposal('single_preview_confirmation')
  }

  const handleRejectPreview = (task: { uniqueId: string }) => {
    const previewId = task.uniqueId
    if (previewId) {
      setEvents(useEvents.getState().events.filter((e) => e.id !== previewId))
    }
    if (previewId) removeFromPreviewTasks(previewId)
  }

  const handleDelete = async (task: { id: string }) => {
    await apiRequest('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.id }) })
    setEvents(useEvents.getState().events.filter((event) => String(event.id) !== task.id))
    setActiveEvent(null)
    await refetchEvents(currentStart, currentEnd)
    toast('Task deleted. The weekly plan needs regeneration.')
  }

  const confirmAllPreview = async () => {
    if (previewTasks.length === 0 || isConfirmingAll) return
    setIsConfirmingAll(true)

    const taskList = [...previewTasks]
    try {
      const results = await Promise.allSettled(
        taskList.map((task) =>
          apiRequest('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              request_id: `preview-confirm-${task.uniqueId}`,
              title: task.title,
              deadline_at: task.deadlineAt || task.end?.toISOString(),
              due: task.due || task.timeText,
              duration: task.duration,
              estimated_duration: task.duration,
              priority: task.priority || 'medium',
              status: 'queued',
              context: task.context || task.description || '',
              progress: task.progress || '',
              next_step: task.nextStep || '',
              open_questions: task.openQuestions || '',
              context_window: task.previewAdjusted
                ? {
                    last_schedule_change: {
                      reason: batchReason.trim(),
                      response_status: batchReason.trim() ? 'answered' : 'skipped',
                      interaction_source: 'preview_bulk_confirmation',
                    },
                  }
                : undefined,
            }),
          }),
        ),
      )

      const succeeded = new Set(
        results.flatMap((result, index) => result.status === 'fulfilled' ? [taskList[index].uniqueId] : []),
      )
      setEvents(useEvents.getState().events.filter((event) => !event.id || !succeeded.has(String(event.id))))
      setPreviewTasks((current) => current.filter((task) => !succeeded.has(task.uniqueId)))
      if (activeEvent && succeeded.has(activeEvent.uniqueId)) setActiveEvent(null)
      const failedCount = results.length - succeeded.size
      if (failedCount > 0) toast(`${succeeded.size} confirmed, ${failedCount} failed and remain for retry`)
      else toast(t('workspace.confirmCalendar'))
      setShowBatchReason(false)
      setBatchReason('')
      await refetchEvents(currentStart, currentEnd)
      if (failedCount === 0) {
        await openScheduleProposal('task_preview_confirmation')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Tasks were saved, but the schedule preview could not be generated')
    } finally {
      setIsConfirmingAll(false)
    }
  }

  const handleConfirmAllPreview = () => {
    if (previewTasks.some((task) => task.previewAdjusted)) {
      setShowBatchReason(true)
      return
    }
    void confirmAllPreview()
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
    if (!activeEvent?.id) return
    const result = await apiRequest<PlanResourceEnvelope<{ revision_created: boolean; plan?: PlanDecision; execution_sessions: ExecutionSession[] }>>('/api/plans/adjust-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: activeEvent.id,
        start_at: task.start?.toISOString(),
        end_at: task.end?.toISOString(),
        request_id: requestId('task-adjust'),
        task_patch: {
          title: task.title,
          priority: task.priority,
          context: task.context || task.description || '',
          contextWindow: {
            progress: task.progress || '',
            nextStep: task.nextStep || '',
            openQuestions: task.openQuestions || '',
          },
        },
      }),
    })
    window.dispatchEvent(new CustomEvent('humanos:plan-updated', {
      detail: { source: 'task-adjustment', revisionCreated: result.data.revision_created, planRevision: result.data.plan?.plan_revision, executionSessions: result.data.execution_sessions },
    }))
    toast(result.data.revision_created ? t('planning.confirmed') : t('event.eventUpdated'))
    await refetchEvents(currentStart, currentEnd)
  }

  const openFocus = async (task: { id: string; status?: string }) => {
    try {
      const result = await apiRequest<ExecutionResourceEnvelope<{ execution_sessions: ExecutionSession[] }>>('/api/execution-sessions?status=running,paused,ready')
      let session = (result.data.execution_sessions || []).find((item) => String(item.task_id) === String(task.id))
      if (!session) {
        toast(t('execution.noSessionDescription'))
        router.push('/app/plan')
        return
      }
      if (session && !['running', 'paused'].includes(String(session.status))) {
        await apiRequest('/api/execution-sessions/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ execution_session_id: session.execution_session_id, request_id: requestId('calendar-start') }) })
        await refetchEvents(currentStart, currentEnd)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('execution.startFailed'))
    } finally {
      setActiveEvent(null)
      router.push('/app/focus')
    }
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
          duration: activeEvent.duration,
          deadlineAt: activeEvent.deadlineAt,
          due: activeEvent.due,
          missingFields: activeEvent.missingFields,
          expectedDifficulty: activeEvent.expectedDifficulty,
          dependency: activeEvent.dependency,
          createRequestId: activeEvent.createRequestId,
          isPreview: activeEvent.isPreview,
          start: activeEvent.start,
          end: activeEvent.end,
        }}
        onConfirm={activeEvent.isPreview ? handleConfirm : undefined}
        onReject={activeEvent.isPreview ? handleReject : undefined}
        onSave={!activeEvent.isPreview && activeEvent.id ? handleSave : undefined}
        onOpenFocus={!activeEvent.isPreview && activeEvent.id ? openFocus : undefined}
        onDelete={!activeEvent.isPreview && activeEvent.id ? handleDelete : undefined}
      />
    )
  }

  if (proposalError && previewTasks.length === 0) {
    return (
      <aside className="w-72 shrink-0 border-l border-border bg-background p-4">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="text-sm font-semibold">{t('planning.generateFailed')}</h2>
          <p className="mt-2 text-xs leading-5">{proposalError}</p>
          <p className="mt-2 text-xs leading-5">Tasks are saved. Retrying will only regenerate the schedule preview.</p>
          <Button className="mt-4 w-full" size="sm" onClick={() => void retryScheduleProposal()} disabled={proposalRetrying}>
            {proposalRetrying ? 'Regenerating...' : 'Regenerate plan'}
          </Button>
        </div>
      </aside>
    )
  }

  // Branch 2: Preview task list
  if (previewTasks.length > 0) {
    return (
      <aside className="w-72 border-l border-border bg-background overflow-y-auto shrink-0">
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 p-4 backdrop-blur">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                {t('workspace.aiGeneratedTasks')}
              </h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {previewTasks.length}
              </span>
            </div>
            <Button
              className="h-9 w-full rounded-xl shadow-sm"
              onClick={() => void confirmAllPreview()}
              disabled={isConfirmingAll || previewTasks.length === 0 || previewTasks.some((task: any) => Array.isArray(task.missingFields) && task.missingFields.length > 0)}
            >
              {isConfirmingAll ? t('workspace.savingTaskFacts') : t('workspace.saveAllTaskFacts')}
            </Button>
            {proposalError && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><p>{proposalError}</p><Button className="mt-2 w-full" size="sm" variant="outline" onClick={() => void retryScheduleProposal()} disabled={proposalRetrying}>{proposalRetrying ? 'Regenerating...' : 'Regenerate plan'}</Button></div>}
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
                  {task.due || t('workspace.unscheduledTask')}
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
                  {t('workspace.saveTaskFacts')}
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
  return <PlanReviewPanel />
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

  const { t, locale } = useTranslation()
  const { activeEvent, setActiveEvent, setPreviewTasks } = useModal()
  const [pendingCalendarEdit, setPendingCalendarEdit] = useState<{
    taskId: string
    before: { start: string | null; end: string | null }
    after: { start: string | null; end: string | null }
    eventType: 'move_session' | 'resize_session'
    revert: () => void
  } | null>(null)
  const [calendarEditReason, setCalendarEditReason] = useState('')
  const [savingCalendarEdit, setSavingCalendarEdit] = useState(false)

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
    if (event.event.extendedProps.isPreview) {
      const nextStart = event.event.start
      const nextEnd = event.event.end
      setPreviewTasks((tasks) => tasks.map((task) => task.uniqueId === event.event.id
        ? { ...task, start: nextStart, end: nextEnd, previewAdjusted: true }
        : task))
      if (activeEvent?.uniqueId === event.event.id) {
        setActiveEvent({ ...activeEvent, start: nextStart, end: nextEnd, previewAdjusted: true })
      }
      return
    }

    const oldEvent = event.oldEvent
    setPendingCalendarEdit({
      taskId: String(event.event.extendedProps.taskId || event.event.id),
      before: { start: oldEvent.start?.toISOString() || null, end: oldEvent.end?.toISOString() || null },
      after: { start: event.event.start?.toISOString() || null, end: event.event.end?.toISOString() || null },
      eventType: 'oldEvent' in event && event.event.start?.getTime() === oldEvent.start?.getTime()
        ? 'resize_session'
        : 'move_session',
      revert: () => event.revert(),
    })
  }

  const cancelCalendarEdit = () => {
    pendingCalendarEdit?.revert()
    setPendingCalendarEdit(null)
    setCalendarEditReason('')
  }

  const saveCalendarEdit = async () => {
    if (!pendingCalendarEdit || savingCalendarEdit) return
    setSavingCalendarEdit(true)
    const reason = calendarEditReason.trim()
    try {
      const active = await apiRequest<PlanResourceEnvelope<{ plan: PlanDecision | null }>>('/api/plans/active')
      const basePlan = active.data.plan
      const basePatch = basePlan?.plan_patch || []
      const originalBlock = basePatch.find((block: any) => String(block.task_id) === pendingCalendarEdit.taskId)

      if (basePlan?.plan_id && originalBlock) {
        const revisedResult = await apiRequest<PlanResourceEnvelope<{ plan: PlanDecision }>>('/api/plans/revise', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: basePlan.plan_id, request_id: `drag-${Date.now()}` }),
        })
        const revised = revisedResult.data.plan
        const nextStart = new Date(pendingCalendarEdit.after.start || '')
        const nextEnd = new Date(pendingCalendarEdit.after.end || '')
        const mondayIndex = (nextStart.getDay() + 6) % 7
        const nextPatch = (revised.plan_patch || []).map((block: any) => {
          if (String(block.block_id) !== String(originalBlock.block_id)) return block
          return {
            ...block,
            day_index: mondayIndex,
            start: nextStart.getHours() + nextStart.getMinutes() / 60,
            end: nextEnd.getHours() + nextEnd.getMinutes() / 60,
            start_at: nextStart.toISOString(),
            end_at: nextEnd.toISOString(),
            session_minutes: Math.max(Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000), 1),
          }
        })
        await apiRequest('/api/plan-edits/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            edit_episode_id: revised.edit_episode_id,
            task_id: pendingCalendarEdit.taskId,
            block_id: originalBlock.block_id,
            event_type: pendingCalendarEdit.eventType,
            before: pendingCalendarEdit.before,
            after: pendingCalendarEdit.after,
            interaction_source: 'calendar_drag',
            request_id: `edit-${Date.now()}`,
          }),
        })
        const validationResult = await apiRequest<any>('/api/schedules/validate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...revised, plan_patch: nextPatch }),
        })
        const validation = validationResult.validation || validationResult
        if (validation.valid === false) throw new Error(validation.violations?.[0]?.message || 'This time conflicts with the plan constraints')
        await apiRequest('/api/schedules/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: revised.plan_id,
            week_id: revised.week_id,
            edit_episode_id: revised.edit_episode_id,
            decision: revised,
            plan_patch: nextPatch,
            unscheduled_tasks: revised.unscheduled_tasks || [],
            rationale: {
              reason_codes: reason ? ['user_reported_schedule_change'] : [],
              raw_user_response: reason,
              parsed_reason: { raw_text: reason, reason_codes: reason ? ['user_reported_schedule_change'] : [] },
              affected_task_ids: [pendingCalendarEdit.taskId],
              response_status: reason ? 'answered' : 'skipped',
              generalizability: 'not_sure',
              request_id: `rationale-${Date.now()}`,
            },
          }),
        })
        window.dispatchEvent(new CustomEvent('humanos:plan-updated', {
          detail: { source: 'calendar-drag-confirmation' },
        }))
      } else {
        await apiRequest('/api/tasks', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: pendingCalendarEdit.taskId,
            start: pendingCalendarEdit.after.start,
            end: pendingCalendarEdit.after.end,
            context_window: {
              last_schedule_change: {
                before: pendingCalendarEdit.before,
                after: pendingCalendarEdit.after,
                reason,
                response_status: reason ? 'answered' : 'skipped',
                interaction_source: 'calendar_drag',
              },
            },
          }),
        })
      }
      setPendingCalendarEdit(null)
      setCalendarEditReason('')
      await refetchEvents(currentStart, currentEnd)
      toast(t('event.eventUpdated'))
    } catch (error) {
      pendingCalendarEdit.revert()
      toast(error instanceof Error ? error.message : 'Failed to save calendar change')
    } finally {
      setSavingCalendarEdit(false)
    }
  }

  const handleSendMessage = async (message: string) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, assistant_mode: 'task_planner', locale }),
    })
    if (res.ok) {
      await refetchEvents(currentStart, currentEnd)
      const data = await res.json()
      // If AI returned tasks, show the first one in the right inspector
      const tasks = data?.turn?.tasks
      if (tasks && tasks.length > 0) {
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

        // Build ActiveEvent list for all tasks and show in right inspector
        const allPreviewTasks = tasks.map((task: any, index: number) => {
          const taskStart = getStart(task)
          const taskEnd = getEnd(task)
          return {
            id: task.id || 'chat-task',
            uniqueId: 'preview-' + (task.id || `${Date.now()}-${index}`),
            title: task.title || `Task ${index + 1}`,
            start: taskStart ? new Date(taskStart) : null,
            end: taskEnd ? new Date(taskEnd) : null,
            allDay: task.all_day || false,
            timeText: task.due || task.deadline || '',
            description: task.context || data.turn.reply || '',
            attendees: task.attendees || [],
            status: task.status || 'pending',
            priority: task.priority || 'medium',
            duration: Number(task.duration || task.estimated_duration || 0) || undefined,
            deadlineAt: task.deadline_at || task.end_time || undefined,
            due: task.due || task.deadline || undefined,
            isPreview: true,
            context: task.context || '',
            progress: task.progress || '',
            nextStep: task.next_step || '',
            openQuestions: task.open_questions || '',
            missingFields: task.missing_fields || [],
            expectedDifficulty: task.expected_difficulty ?? null,
            dependency: task.dependency || '',
            createRequestId: task.create_request_id || `task-import-${task.id || `${Date.now()}-${index}`}`,
          }
        })
        // New AI results must replace any previously selected task detail so
        // the preview list and its bulk-confirm action are immediately visible.
        setActiveEvent(null)
        setPreviewTasks(allPreviewTasks)
        setRightOpen(true)
      }
      return data
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TaskReminder />
      {/* Top bar */}
      <div className="border-b shrink-0">
        <CustomHeader calendarRef={calendarRef} />
      </div>

      {/* Three-column layout */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
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
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-2">
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
            expandRows
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
            dayHeaderContent={(arg: any) => {
              const weekday = arg.date.toLocaleDateString(undefined, { weekday: 'short' }).replace('.', '')
              if (arg.view.type === 'dayGridMonth') return <span>{weekday}</span>
              return <><span>{weekday}</span>{' '}<span>{arg.date.getDate()}</span></>
            }}
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
            dayMaxEvents={3}
            moreLinkClick="popover"
            eventContent={function renderEventContent(arg) {
              if (arg.view.type === 'dayGridMonth') {
                const isPreview = Boolean(arg.event.extendedProps.isPreview)
                return (
                  <button
                    type="button"
                    className={`flex w-full min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-4 ${isPreview ? 'border border-dashed border-primary/60 bg-primary/10' : 'bg-primary/15 text-primary'}`}
                    onClick={() => setActiveEvent({
                      id: String(arg.event.extendedProps.taskId || arg.event.id),
                      uniqueId: isPreview ? arg.event.id : `${arg.event.id}-${arg.event.start?.toISOString()}`,
                      title: arg.event.title,
                      start: arg.event.start,
                      end: arg.event.end,
                      allDay: arg.event.allDay,
                      timeText: arg.timeText,
                      description: arg.event.extendedProps.description || '',
                      attendees: arg.event.extendedProps.attendees || [],
                      status: arg.event.extendedProps.status || 'scheduled',
                      priority: arg.event.extendedProps.priority || 'medium',
                      isPreview,
                      context: arg.event.extendedProps.context || '',
                      progress: arg.event.extendedProps.progress || '',
                      nextStep: arg.event.extendedProps.nextStep || '',
                      openQuestions: arg.event.extendedProps.openQuestions || '',
                      executionSessionId: arg.event.extendedProps.executionSessionId,
                      planRevision: arg.event.extendedProps.planRevision,
                    })}
                  >
                    {arg.timeText && <span className="shrink-0 opacity-70">{arg.timeText}</span>}
                    <span className="truncate">{arg.event.title}</span>
                  </button>
                )
              }
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
      {pendingCalendarEdit && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-2xl">
            <h3 className="text-lg font-semibold">{locale === 'zh' ? '为什么调整这个任务？' : 'Why did you adjust this task?'}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{locale === 'zh' ? '原因可选，并且只用于本次日程变更。' : 'The reason is optional and applies only to this schedule change.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">{(locale === 'zh' ? ['时间冲突', '精力状态', '优先级变化', '可用时间变化', '时长变化'] : ['Time conflict', 'Energy level', 'Priority changed', 'Availability changed', 'Duration changed']).map((reason) => <Button key={reason} type="button" size="sm" variant={calendarEditReason === reason ? 'default' : 'outline'} onClick={() => setCalendarEditReason(reason)}>{reason}</Button>)}</div>
            <textarea className="mt-4 min-h-24 w-full rounded-md border bg-background p-3 text-sm" placeholder={locale === 'zh' ? '可选说明' : 'Optional explanation'} value={calendarEditReason} onChange={(event) => setCalendarEditReason(event.target.value)} />
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={cancelCalendarEdit} disabled={savingCalendarEdit}>{locale === 'zh' ? '取消并恢复' : 'Cancel and restore'}</Button><Button onClick={() => void saveCalendarEdit()} disabled={savingCalendarEdit}>{calendarEditReason.trim() ? (locale === 'zh' ? '保存变更' : 'Save change') : (locale === 'zh' ? '跳过原因并保存' : 'Skip reason and save')}</Button></div>
          </div>
        </div>
      )}
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

  return <AppContent calendarRef={calendarRef} leftOpen={leftOpen} setLeftOpen={setLeftOpen} rightOpen={rightOpen} setRightOpen={setRightOpen} chatFocusKey={chatFocusKey} triggerChatFocus={triggerChatFocus} />
}
