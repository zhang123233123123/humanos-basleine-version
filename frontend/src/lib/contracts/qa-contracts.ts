export interface HumanOSHealth {
  ok: boolean
  db: string
  embedding_model: string
  ai_enabled: boolean
  ai_provider: string | null
  ai_model: string | null
  scheduling_mode: string
  test_mode: boolean
  qa_mode: boolean
  clock: TestClock | null
}

export interface TestClock {
  enabled: boolean
  simulated_now: string
  time_scale: number
  week_id: string
}

export interface QAScenario {
  id: string
  label?: string
  description?: string
  simulated_time: string
  database: string
}

export interface QAScenarioManifest {
  scenarios: QAScenario[]
  qa_user?: Record<string, unknown>
}

export interface QAScenarioRestore {
  scenario: QAScenario
  clock: TestClock
  qa_user: Record<string, unknown>
}
