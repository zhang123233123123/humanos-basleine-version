export interface PatternCandidate {
  pattern_label: string
  episode_count: number
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
}

