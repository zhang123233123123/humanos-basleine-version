export type ExecutionStatus = 'ready' | 'running' | 'paused' | 'ended' | 'completed' | 'superseded' | string
export type ExecutionMode = 'up_next' | 'running' | 'paused' | 'empty' | 'none' | 'idle' | string

export interface ExecutionSession {
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
  paused_at?: string | number | null
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
  [key: string]: unknown
}
