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
  requires_confirmation?: boolean
  unavailable?: boolean
  error?: string
  [key: string]: unknown
}
