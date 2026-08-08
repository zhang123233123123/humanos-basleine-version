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

