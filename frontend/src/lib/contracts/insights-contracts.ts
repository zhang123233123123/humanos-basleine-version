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

export interface ProfileTraitEffect {
  trait_id: string
  trait_key: string
  value: Record<string, unknown>
  pattern_label?: string
  usage_with_feedback_count: number
  total_linked_feedback_count: number
  execution_session_count: number
  completion: { completed: number; partial: number; not_started: number; other: number }
  timing_feedback: { helpful: number; unhelpful: number; unrated: number }
  attribution: {
    independent_count: number
    parallel_count: number
    unknown_count: number
    parallel_excluded_from_assessment: true
    unknown_excluded_from_assessment: true
  }
  parallel_outcomes: {
    completion: { completed: number; partial: number; not_started: number; other: number }
    timing_feedback: { helpful: number; unhelpful: number; unrated: number }
    evidence_ids: string[]
  }
  assessment: 'insufficient_data' | 'initially_consistent' | 'mixed' | 'possible_mismatch'
  evidence_ids: string[]
  causal_claim_allowed: false
  profile_write_allowed: false
  latest_review?: { action: 'keep' | 'later' | 'forget'; defer_until?: number; created_at: number } | null
  review_prompt_allowed?: boolean
}

export interface ProfileTraitRecord {
  trait_id: string
  trait_key: string
  value: Record<string, unknown>
  scope: Record<string, unknown>
  evidence_ids: string[]
  confidence_level: 'low' | 'medium' | 'high'
  status: 'confirmed' | 'paused' | 'superseded' | 'forgotten'
  display_label: string
  confirmed_at: string | number
  updated_at: string | number
  latest_review?: { action: string; created_at: number } | null
  effect?: ProfileTraitEffect | null
}

export type ProfileTraitEvidenceRole = 'supporting' | 'counter' | 'execution_outcome_independent' | 'execution_outcome_parallel' | 'execution_outcome_unknown'

export interface ProfileTraitEvidenceItem {
  evidence_id: string
  source_type: string
  source_id: string
  origin: string
  observed_at: string | number
  claim_key: string
  structured_value: unknown
  scope: Record<string, unknown>
  text?: string | null
  user_explicit: boolean
  confidence_level: 'low' | 'medium' | 'high'
  eligible_for_pattern: boolean
  effective: boolean
  requires_user_confirmation: true
  role: ProfileTraitEvidenceRole
}

export interface ProfileTraitEvidenceTrace {
  trait: Pick<ProfileTraitRecord, 'trait_id' | 'trait_key' | 'value' | 'scope' | 'status' | 'confidence_level' | 'confirmed_at'> & {
    display_label: string
    source_candidate_id?: string | null
  }
  evidence: ProfileTraitEvidenceItem[]
  summary: {
    supporting_count: number
    counter_count: number
    independent_outcome_count: number
    parallel_outcome_count: number
    unknown_outcome_count: number
    missing_evidence_ids: string[]
  }
}

export interface EvidenceDeletionImpact {
  evidence: ProfileTraitEvidenceItem
  affected_traits: Array<{ trait_id: string; display_label: string; status: string; role: ProfileTraitEvidenceRole }>
  role_counts: Record<string, number>
  candidate_patterns_recomputed: boolean
  trait_effects_recomputed: boolean
  confirmed_traits_unchanged: true
  active_plan_unchanged: true
  source_record_deleted: false
}

export interface ProfileDataExport {
  schema_version: string
  generated_at: string
  profile_traits: ProfileTraitRecord[]
  trait_evidence_traces: ProfileTraitEvidenceTrace[]
  evidence: ProfileTraitEvidenceItem[]
  confirmation_history: Array<Record<string, unknown>>
  review_history: Array<Record<string, unknown>>
  metadata: Record<string, boolean>
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
    resource: 'pattern_candidates' | 'learned_pattern' | 'memory_evidence' | 'profile_trait_effects' | 'profile_trait_review' | 'profile_traits' | 'profile_trait' | 'profile_trait_evidence' | 'profile_data_export' | 'evidence_deletion_impact' | 'evidence_deletion'
    aggregate_root: 'profile'
    read_only: boolean
    plan_write_allowed: false
    confirmation_required?: boolean
    active_plan_unchanged?: boolean
    causal_claim_allowed?: boolean
    profile_write_allowed?: boolean
    unrelated_evidence_excluded?: boolean
    destructive_action?: boolean
    source_record_deleted?: boolean
    automatic_profile_update?: boolean
  }
}
