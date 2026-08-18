export interface PatternCandidate {
  candidate_id: string
  pattern_label: string
  trait_key: string
  proposed_value: Record<string, unknown>
  scope: Record<string, unknown>
  supporting_evidence_ids: string[]
  counter_evidence_ids: string[]
  episode_count: number
  counter_evidence_count: number
  evidence_day_count: number
  support_day_count: number
  support_ratio: number
  confidence_level: 'low' | 'medium' | 'high'
  status: 'candidate' | 'insufficient_evidence' | string
  can_suggest_update: boolean
  requires_user_confirmation: boolean
}

export interface LearnedPattern {
  pattern_label: string
  evidence_count: number
  user_confirmed: boolean
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
