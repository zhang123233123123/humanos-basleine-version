export type ExecutionStatus = 'ready' | 'running' | 'paused' | 'ended' | 'completed' | 'superseded' | string
export type ExecutionMode = 'up_next' | 'running' | 'paused' | 'empty' | 'none' | 'idle' | string
export type InterruptionAction = 'short_break' | 'continue_later' | 'switch_task' | 'help_decide'

export interface ExecutionSession {
  accumulated_active_minutes?: number | null
  execution_session_id: string
  task_id: string
  block_id?: string
  task_title?: string
  title?: string
  status: ExecutionStatus
  planned_start_at?: string
  planned_end_at?: string
  planned_work_minutes?: number
  actual_minutes?: number
  session_remaining_minutes?: number
  started_at?: string | number | null
  actual_start_at?: string | number | null
  paused_at?: string | number | null
  resumed_at?: string | number | null
  pause_reason?: string | null
  interruption_action?: InterruptionAction | null
  interruption_snapshot?: Record<string, unknown> | null
  resume_preference?: string | null
  preferred_resume_at?: string | null
  remaining_at_pause?: number | null
  resumed_from_session_id?: string | null
  ended_at?: string | number | null
  task?: {
    title?: string
    context?: string
    contextWindow?: Record<string, unknown>
    execution?: Record<string, unknown>
  }
  [key: string]: unknown
}

export interface CurrentExecution {
  mode: ExecutionMode
  session?: ExecutionSession | null
  task?: ExecutionSession['task'] | null
  deferred_sessions?: ExecutionSession[]
  [key: string]: unknown
}

export interface ExecutionImpact {
  action: string
  execution_session_id: string
  evaluated_at: string
  remaining_minutes: number
  estimated_end_at: string
  requires_plan_adjustment: boolean
  affected_sessions: Array<{
    execution_session_id: string
    task_id: string
    task_title?: string
    planned_start_at?: string
    planned_end_at?: string
    overlap_minutes: number
  }>
  options: string[]
  capacity_projection?: {
    plan_id?: string
    plan_revision?: number
    week_id?: string
    fixed_event_interval_ids: string[]
    buffer_minutes: number
    protected_interval_ids: string[]
  }
}

export interface ExecutionInterruption {
  action: InterruptionAction
  next_stage: 'break_timer' | 'capture_context_and_resume_time' | 'capture_context_and_ready_queue' | 'capture_reason_and_runtime_state' | string
  context_required: boolean
  runtime_state_required: boolean
  formal_calendar_changed: boolean
  policy: Record<string, unknown>
}

export interface LocalRescheduleCheck {
  change_minutes: number
  absorbed: Array<{ source: 'session_slack' | 'idle_gap' | 'buffer' | string; minutes: number }>
  unabsorbed_minutes: number
  absorbed_without_calendar_change: boolean
  calendar_diff_required: boolean
  formal_calendar_changed: boolean
  releasable_execution_session_ids: string[]
  confirmation_required: boolean
}

export interface ReadyQueueItem {
  execution_session_id: string
  task_id: string
  task_title: string
  planned_start_at?: string
  planned_work_minutes?: number
  remaining_minutes?: number
  priority?: string
  expected_difficulty?: number
}

export interface LocalCalendarDiff {
  base_plan_id: string
  base_plan_revision: number
  week_id: string
  scope: 'local'
  trigger: string
  status: 'proposed'
  changes: Array<{ type: 'move_session'; before: Record<string, unknown>; after: Record<string, unknown> }>
  affected_execution_session_ids: string[]
  protected_resources: string[]
  confirmation_required: true
  formal_calendar_changed: false
}

export interface ExecutionFeedbackResult {
  feedback?: Record<string, unknown>
  task: Record<string, unknown>
  execution_session?: ExecutionSession | null
  requires_plan_adjustment: boolean
  schedule_action: 'keep_time_free' | 'review_today'
}

export interface ExecutionResourceEnvelope<T> {
  data: T
  resources: {
    self: string
    tasks: string
    current: string
  }
  meta: {
    resource: 'execution_session' | 'execution_sessions' | 'execution_impact'
    aggregate_root: 'task'
    read_only: boolean
  }
}
