import type { HumanOSTask, HumanOSMapEventInput } from '@/lib/contracts/task-contracts'

function toISOString(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'number') {
    const date = new Date(value > 9999999999 ? value : value * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asNumber(input: unknown, fallback = 0): number {
  const value = Number(input)
  return Number.isFinite(value) ? value : fallback
}

function normalizeStatus(value: unknown): HumanOSMapEventInput['extendedProps']['status'] {
  const raw = String(value || '').toLowerCase().trim()
  return (raw || 'pending') as HumanOSMapEventInput['extendedProps']['status']
}

function normalizePriority(value: unknown): string {
  const aliases: Record<string, string> = { 高: 'high', 中: 'medium', 低: 'low' }
  const raw = aliases[String(value || 'medium').toLowerCase().trim()] || String(value || 'medium').toLowerCase().trim()
  return ['high', 'medium', 'low'].includes(raw) ? raw : 'medium'
}

function contextWindow(task: HumanOSTask): Record<string, unknown> {
  return { ...(task.contextWindow || {}), ...(task.context_window || {}) }
}

function contextText(task: HumanOSTask, key: string): string {
  const value = contextWindow(task)[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function estimateMinutes(task: HumanOSTask): number {
  if (asNumber(task.duration) > 0) return asNumber(task.duration)
  const execution = task.execution || {}
  return Math.max(asNumber(execution.original_estimate_minutes || execution.remaining_duration_minutes || execution.accumulated_actual_minutes), 60)
}

function mapTaskToEvent(task: HumanOSTask, session?: Record<string, any>): HumanOSMapEventInput | null {
  const context = contextWindow(task)
  const sessionStart = toISOString(session?.planned_start_at)
  const taskStart = toISOString(task.start_at) || toISOString(context.startAt) || toISOString(context.start_at) || toISOString(task.start_time) || toISOString(task.start)
  const start = sessionStart || taskStart
  if (!start) return null
  const sessionEnd = toISOString(session?.planned_end_at)
  const taskEnd = toISOString(task.end_time) || toISOString(task.end)
  let end = sessionEnd || taskEnd
  const endWasDerived = !end
  if (!end) {
    const date = new Date(start)
    date.setMinutes(date.getMinutes() + Math.max(estimateMinutes(task), 1))
    end = date.toISOString()
  }
  return {
    id: String(session?.execution_session_id || task.id || `tmp-${Date.now()}`),
    title: task.title || 'Untitled',
    start,
    end,
    allDay: Boolean(task.all_day),
    extendedProps: {
      description: task.context || '',
      status: normalizeStatus(session?.status === 'ready' ? task.status || 'scheduled' : session?.status || task.status),
      priority: normalizePriority(task.priority),
      attendees: task.attendees || [],
      context: task.context || '',
      progress: contextText(task, 'progress'),
      nextStep: contextText(task, 'nextStep') || contextText(task, 'next_step'),
      openQuestions: contextText(task, 'openQuestions') || contextText(task, 'open_questions'),
      execution: task.execution || {},
      executionSessionId: session?.execution_session_id,
      blockId: session?.block_id,
      taskType: String(task.task_type || ''),
      taskId: String(task.id || ''),
      planRevision: session?.plan_revision,
      duration: asNumber(task.duration || task.estimated_duration) || undefined,
      deadlineAt: toISOString(task.deadline_at) || undefined,
      due: String(task.due || task.deadline || ''),
      expectedDifficulty: task.expected_difficulty ?? null,
      dependency: contextText(task, 'dependency') || String(task.dependency || ''),
      resourceModality: task.resource_modality || [],
      attentionMode: task.attention_mode,
      parallelizable: task.parallelizable,
      fieldSources: {
        start: sessionStart ? 'execution_session' : 'user_or_persisted',
        end: sessionEnd ? 'execution_session' : endWasDerived ? 'system_derived' : 'user_or_persisted',
        title: task.title ? 'user_or_persisted' : 'default_unconfirmed',
        priority: task.priority ? 'user_or_persisted' : 'default_unconfirmed',
        status: session?.status ? 'execution_session' : task.status ? 'user_or_persisted' : 'default_unconfirmed',
        attentionMode: task.attention_mode ? 'user_or_persisted' : 'default_unconfirmed',
        context: task.context ? 'user_or_persisted' : 'default_unconfirmed',
        progress: contextText(task, 'progress') ? 'user_or_persisted' : 'default_unconfirmed',
        nextStep: contextText(task, 'nextStep') || contextText(task, 'next_step') ? 'user_or_persisted' : 'default_unconfirmed',
        openQuestions: contextText(task, 'openQuestions') || contextText(task, 'open_questions') ? 'user_or_persisted' : 'default_unconfirmed',
        duration: task.duration || task.estimated_duration ? 'user_or_persisted' : 'default_unconfirmed',
        deadline: task.deadline_at || task.due || task.deadline ? 'user_or_persisted' : 'default_unconfirmed',
        dependency: contextText(task, 'dependency') || task.dependency ? 'user_or_persisted' : 'default_unconfirmed',
        resourceModality: task.resource_modality?.length ? 'user_or_persisted' : 'default_unconfirmed',
        parallelizable: typeof task.parallelizable === 'boolean' ? 'user_or_persisted' : 'default_unconfirmed',
      },
    },
  }
}

function inRange(event: HumanOSMapEventInput, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return true
  const eventStart = Date.parse(event.start || '')
  const eventEnd = Date.parse(event.end || event.start)
  const left = Date.parse(start)
  const right = Date.parse(end)
  return [eventStart, eventEnd, left, right].some(Number.isNaN) || (eventStart < right && eventEnd > left)
}

export function projectCalendarEvents(
  tasks: HumanOSTask[],
  sessions: Array<Record<string, any>>,
  rangeStart?: string | null,
  rangeEnd?: string | null,
): HumanOSMapEventInput[] {
  const taskById = new Map(tasks.filter((task) => !task.is_preview && !task.id?.startsWith('preview-')).map((task) => [String(task.id), task]))
  const visibleSessions = sessions.filter((session) => !['superseded', 'cancelled'].includes(String(session.status || '').toLowerCase()))
  const sessionTaskIds = new Set(visibleSessions.map((session) => String(session.task_id || '')))
  const sessionEvents = visibleSessions.map((session) => {
    const task = taskById.get(String(session.task_id || ''))
    if (!task) return null
    return mapTaskToEvent(task, session)
  })
  const directTaskEvents = tasks
    .filter((task) => !task.is_preview && !task.id?.startsWith('preview-') && !sessionTaskIds.has(String(task.id || '')))
    .map((task) => mapTaskToEvent(task))
  return [...sessionEvents, ...directTaskEvents]
    .filter((event): event is HumanOSMapEventInput => event !== null)
    .filter((event) => inRange(event, rangeStart, rangeEnd))
}

export function projectDraftPlanEvents(plan: Record<string, any> | null, tasks: HumanOSTask[], rangeStart?: string | null, rangeEnd?: string | null): HumanOSMapEventInput[] {
  if (!plan || plan.plan_status === 'confirmed') return []
  const monday = new Date(`${plan.week_id}T00:00:00`)
  if (Number.isNaN(monday.getTime())) return []
  const taskById = new Map(tasks.map((task) => [String(task.id), task]))
  return (plan.plan_patch || []).map((block: Record<string, any>, index: number) => {
    const start = new Date(monday)
    start.setDate(monday.getDate() + Number(block.day_index || 0))
    start.setMinutes(Math.round(Number(block.start || 0) * 60))
    const end = new Date(monday)
    end.setDate(monday.getDate() + Number(block.day_index || 0))
    end.setMinutes(Math.round(Number(block.end || 0) * 60))
    const task = taskById.get(String(block.task_id))
    return {
      id: `draft-${plan.plan_id}-${block.block_id || index}`,
      title: block.title || task?.title || 'Untitled',
      start: start.toISOString(), end: end.toISOString(), allDay: false,
      extendedProps: {
        description: task?.context || '', status: 'proposed', priority: normalizePriority(task?.priority), attendees: [], context: task?.context || '', progress: contextText(task || {}, 'progress'), nextStep: contextText(task || {}, 'nextStep') || contextText(task || {}, 'next_step'), openQuestions: contextText(task || {}, 'openQuestions') || contextText(task || {}, 'open_questions'), blockId: block.block_id, taskType: String(task?.task_type || ''), taskId: String(task?.id || block.task_id || ''), isPreview: true, planRevision: plan.plan_revision, parallelGroupId: block.parallel_group_id, parallelRole: block.parallel_role,
        duration: asNumber(task?.duration || task?.estimated_duration) || undefined, deadlineAt: toISOString(task?.deadline_at) || undefined, due: String(task?.due || task?.deadline || ''), expectedDifficulty: task?.expected_difficulty ?? null, dependency: contextText(task || {}, 'dependency') || String(task?.dependency || ''), resourceModality: task?.resource_modality || [], attentionMode: task?.attention_mode, parallelizable: task?.parallelizable,
        fieldSources: { start: 'system_derived', end: 'system_derived', title: task?.title ? 'user_or_persisted' : 'default_unconfirmed', priority: task?.priority ? 'user_or_persisted' : 'default_unconfirmed', status: 'system_derived', context: task?.context ? 'user_or_persisted' : 'default_unconfirmed', progress: contextText(task || {}, 'progress') ? 'user_or_persisted' : 'default_unconfirmed', nextStep: contextText(task || {}, 'nextStep') || contextText(task || {}, 'next_step') ? 'user_or_persisted' : 'default_unconfirmed', openQuestions: contextText(task || {}, 'openQuestions') || contextText(task || {}, 'open_questions') ? 'user_or_persisted' : 'default_unconfirmed', duration: task?.duration || task?.estimated_duration ? 'user_or_persisted' : 'default_unconfirmed', deadline: task?.deadline_at || task?.due || task?.deadline ? 'user_or_persisted' : 'default_unconfirmed', dependency: contextText(task || {}, 'dependency') || task?.dependency ? 'user_or_persisted' : 'default_unconfirmed', resourceModality: task?.resource_modality?.length ? 'user_or_persisted' : 'default_unconfirmed', attentionMode: task?.attention_mode ? 'user_or_persisted' : 'default_unconfirmed', parallelizable: typeof task?.parallelizable === 'boolean' ? 'user_or_persisted' : 'default_unconfirmed' },
      },
    }
  }).filter((event: HumanOSMapEventInput) => inRange(event, rangeStart, rangeEnd))
}
