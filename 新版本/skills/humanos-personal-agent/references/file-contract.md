# User workspace contract

Every user directory contains seven UTF-8 files.

- `identity.json`: `user_id`, `display_name`, `timezone`, `created_at`, `onboarding_status`.
- `profile.json`: raw onboarding answers, stable profile, work rhythm, confirmed preferences, candidate observations.
- `state.json`: latest self-reported energy, focus, fatigue, stress, availability, environment, free text, timestamp.
- `tasks.json`: `{ "tasks": [...] }`; each task keeps stable `id`, title, outcome, deadline, estimated minutes, priority, difficulty, dependencies, status, progress, context, next action, timestamps.
- `plan.json`: `{ "candidate": null|Plan, "active": null|Plan, "history": [...] }`. A Plan contains status, version, generated time, rationale, sessions, unresolved questions, and confirmation metadata.
- `execution.json`: current session plus prior sessions and interruptions. Preserve actual progress and re-entry cues.
- `memory.json`: candidate observations, confirmed patterns, rejected patterns.
- `history.jsonl`: append-only audit records; one valid JSON object per line.
- `conversation.jsonl`: append-only user and assistant turns with timestamps and job IDs.
- `behavior.jsonl`: append-only meaningful UI actions such as plan confirmation, revision, cancellation, calendar edits, task completion, and interruption.

`state.json` includes `source` and `valid_until`. Default display values are not user self-reports and must not drive personalized planning.

Calendar sessions require `session_id`, `task_id`, `title`, `start`, `end`, `status`, `goal`, and `reason`. Use ISO 8601 with the user's offset.

For onboarding, retain `raw_user_input` beside `structured_profile`. Do not erase raw answers when the structured profile changes.
