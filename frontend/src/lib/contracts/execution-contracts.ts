export type ExecutionStatus = 'ready' | 'running' | 'paused' | 'ended' | 'completed' | 'superseded' | string
export type ExecutionMode = 'up_next' | 'running' | 'paused' | 'empty' | 'none' | 'idle' | string

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
