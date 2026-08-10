import type { ExecutionSession } from './execution-contracts'

export interface DiagnosticIssue {
  severity: 'error' | 'warning' | string
  code: string
  entity_type: string
  entity_id?: string
  message: string
}

export interface DeveloperSnapshot {
  generated_at: string
  account: { email: string; account_type: string }
  profile: Record<string, unknown>
  active_plan: Record<string, unknown> | null
  plans: Array<Record<string, unknown>>
  tasks: Array<Record<string, unknown>>
  execution_sessions: ExecutionSession[]
  latest_runtime_state: Record<string, unknown>
  events: Array<{ id: string; type: string; payload: Record<string, unknown>; created_at: number }>
  plan_edit_events: Array<Record<string, unknown>>
  diagnostics: { healthy: boolean; issue_count: number; issues: DiagnosticIssue[] }
}
