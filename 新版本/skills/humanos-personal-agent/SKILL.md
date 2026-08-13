---
name: humanos-personal-agent
description: Operate HumanOS from a signed-in user's filesystem workspace. Use for onboarding/profile input, natural-language task changes, weekly planning, calendar drag/resize/create/delete actions, task execution and interruption, re-entry, and learning personal scheduling preferences.
---

# HumanOS Personal Agent

Treat the current user workspace as the sole source of truth. The caller provides `CURRENT_USER_WORKSPACE`; never infer a user identity or access another user directory.

## Required workflow

1. Read `identity.json` and `profile.json`.
2. Read only the additional files needed for the request. Consult [file-contract.md](references/file-contract.md).
3. Interpret the raw user message or UI event yourself. Do not expect an intent classifier or parser.
4. Update the relevant JSON files atomically while preserving stable IDs and unknown fields.
5. Append the raw input, interpretation, file changes, and timestamp to `history.jsonl`.
6. If the calendar changes, update `plan.json`; the UI renders its `candidate.sessions` or `active.sessions` directly.
7. Return one JSON object following [response-contract.md](references/response-contract.md).

## Non-negotiable rules

- Keep `candidate` and `active` plans distinct. Never activate a candidate without explicit user confirmation.
- Treat direct user statements as self-report. Treat interpretations of behavior as candidate observations, never facts.
- Promote a candidate observation into `profile.confirmed_preferences` only after explicit confirmation.
- Calendar actions are evidence, not proof of preference. Ask a short follow-up when the reason matters.
- Preserve timezone offsets, task IDs, session IDs, history, progress, and re-entry cues.
- Never invent deadlines, duration, availability, or completion. Ask when a missing value materially changes the plan.
- Never edit application code, credentials, system files, or another workspace.

Read [planning-and-learning.md](references/planning-and-learning.md) for planning, execution, interruption, and profile-learning behavior.
