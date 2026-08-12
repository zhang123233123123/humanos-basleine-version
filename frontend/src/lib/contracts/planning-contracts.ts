export interface WeekStatus {
  current_week_id: string
  active_week_id: string
  new_week: boolean
  unfinished_task_ids: string[]
  resources?: { tasks?: string }
}

export interface PlanBlock {
  block_id?: string
  task_id: string
  title?: string
  day_index: number
  start: number
  end: number
  session_minutes?: number
  planned_work_minutes?: number
  kind?: string
  constraint_evidence?: string[]
  [key: string]: unknown
}

export interface PlanValidation {
  valid: boolean
  violations?: Array<{ type?: string; message?: string; [key: string]: unknown }>
  [key: string]: unknown
}

export interface PlanDecision {
  plan_id?: string
  plan_revision?: number
  plan_status?: string
  week_id?: string
  edit_episode_id?: string
  plan_patch: PlanBlock[]
  candidate_plans?: Array<{ id?: string; label?: string; plan_patch?: PlanBlock[] }>
  selected_candidate_id?: string
  validation?: PlanValidation
  unscheduled_tasks?: Array<Record<string, unknown>>
  repair_suggestions?: Array<Record<string, unknown> | string>
  explanation?: string
  reasons?: string[]
  parallel_suggestions?: ParallelSuggestion[]
  requires_confirmation?: boolean
  unavailable?: boolean
  error?: string
  [key: string]: unknown
}

export interface ParallelSuggestion {
  id: string
  kind?: 'context_activity_pair'
  status?: 'pending' | 'accepted' | 'separate'
  primary_task_id?: string
  secondary_task_id?: string
  primary_context_id?: string
  secondary_context_id?: string
  primary_title?: string
  secondary_title?: string
  parallel_group_id: string
  day_index: number
  start: number
  end: number
  suggested_overlap_minutes: number
  evidence?: string[]
  user_confirmed?: boolean
  [key: string]: unknown
}

export interface PlanResourceEnvelope<T> {
  data: T
  resources: { self: string; tasks: string; execution_sessions: string }
  meta: { resource: 'active_plan' | 'plan_revision'; read_only: boolean }
}
