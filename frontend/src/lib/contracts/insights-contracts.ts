export interface PatternCandidate {
  pattern_label: string
  episode_count: number
  status: 'candidate' | 'insufficient_evidence' | string
  can_suggest_update: boolean
  auto_apply?: boolean
  requires_user_confirmation: boolean
}

export interface LearnedPattern {
  pattern_label: string
  evidence_count: number
  user_confirmed: boolean
  auto_learned?: boolean
  active?: boolean
  learned_at?: string | number
  confirmed_at?: string | number
}

export interface MemoryResult {
  memory_id: string
  source_type: string
  source_id: string
  task_id?: string | null
  text: string
  metadata: Record<string, unknown>
  score: number
  created_at: string | number
  evidence_role?: 'profile_learning_evidence'
  plan_write_allowed?: false
}

export interface LearningResourceEnvelope<T> {
  data: T
  resources: Record<string, string>
  meta: {
    resource: 'pattern_candidates' | 'learned_pattern' | 'memory_evidence'
    aggregate_root: 'profile'
    read_only: boolean
    plan_write_allowed: false
    confirmation_required?: boolean
    active_plan_unchanged?: boolean
  }
}
