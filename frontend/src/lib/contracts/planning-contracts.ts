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

export interface LocalCalendarDiff {
  base_plan_id: string
  base_plan_revision: number
  week_id: string
  scope: 'local'
  trigger: 'continue_later'
  status: 'proposed'
  changes: Array<{
    type: 'move_session'
    before: { execution_session_id?: string; task_id?: string; block_id?: string; start_at?: string; end_at?: string; planned_work_minutes?: number }
    after: { execution_session_id?: string; task_id?: string; block_id?: string; start_at?: string; end_at?: string; planned_work_minutes?: number }
  }>
  affected_execution_session_ids: string[]
  protected_resources: string[]
  confirmation_required: boolean
  formal_calendar_changed: boolean
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
  parallel_suggestions?: Array<{ id: string; status?: 'pending' | 'accepted' | 'rejected'; primary_task_id: string; secondary_task_id: string; suggested_overlap_minutes?: number; resource_basis?: string[]; evidence?: string[] }>
  explanation?: string
  source?: string
  calendar_diff?: LocalCalendarDiff
  reasons?: string[]
  personalization?: {
    authority?: 'weak_prior'
    applied_trait_ids?: string[]
    available_trait_ids?: string[]
    applied_traits?: Array<{
      trait_id: string
      trait_key: string
      daypart: 'morning' | 'afternoon' | 'evening' | 'night' | string
      band: 'high' | 'low' | string
      confidence_level?: 'low' | 'medium' | 'high'
      evidence_count?: number
      authority?: 'weak_prior'
    }>
    today_state_overrode_traits?: boolean
  }
  constraint_summary?: {
    hard_constraints?: Array<Record<string, unknown>>
    windows?: Array<Record<string, unknown>>
    preferred_session_minutes?: number
    rest_minutes?: number
    [key: string]: unknown
  }
  requires_confirmation?: boolean
  unavailable?: boolean
  error?: string
  [key: string]: unknown
}

export interface PlanResourceEnvelope<T> {
  data: T
  resources: { self: string; tasks: string; execution_sessions: string }
  meta: { resource: 'active_plan' | 'plan_revision'; read_only: boolean }
}
