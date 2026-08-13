export interface RuntimeState {
  focus: number
  energy: number
  stress: number
  mood?: string
  emotion?: string
  readiness?: string
  attention_residue?: string
  daily_note?: string
  local_date?: string
  [key: string]: unknown
}

export interface ContextDump {
  id?: string
  task_id: string
  progress?: string
  progress_percent?: number
  remaining_duration_minutes?: number
  next_action?: string
  open_questions?: string
  stop_reason?: string
  materials?: unknown[]
  created_at?: string | number
  [key: string]: unknown
}

export interface ReentryResult {
  task_id?: string
  first_step?: string
  progress?: string
  remaining_duration_minutes?: number
  open_questions?: string
  recommendation?: string
  [key: string]: unknown
}

export interface DailyPlanReview {
  requires_plan_adjustment: boolean
  evaluated_at?: string
  first_session: {
    execution_session_id: string
    task_id: string
    task_title?: string
    planned_start_at?: string
    planned_end_at?: string
    planned_work_minutes?: number
  } | null
  reason_codes: string[]
  recommendation?: {
    start_at: string
    duration_minutes: number
  }
  options: string[]
}

export interface ReplanJob {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  error?: string | null
  result?: unknown
}

export interface ReplanRequest {
  required: boolean
  confirmation_required?: boolean
  job?: ReplanJob
}

export interface CheckInResourceEnvelope<T> {
  data: T
  resources: { self: string; profile: string; active_plan: string; execution_sessions: string }
  meta: { resource: 'daily_checkin'; aggregate_root: 'profile'; read_only: boolean }
}

export interface TaskLifecycleResourceEnvelope<T> {
  data: T
  resources: Record<string, string>
  meta: { resource: 'context_dump' | 'reentry_guidance'; aggregate_root: 'task'; read_only: boolean; plan_write_allowed?: false }
}
