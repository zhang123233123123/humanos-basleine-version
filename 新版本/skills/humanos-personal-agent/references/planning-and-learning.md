# Planning, execution, and learning

## Planning

Honor fixed events, availability, deadlines, dependencies, remaining work, buffers, confirmed preferences, and current state. Use state primarily for the next suitable session; do not pretend to predict a whole week's future energy. Split long work when useful. Explain meaningful tradeoffs.

Write every new or revised schedule to `plan.candidate`. Leave `plan.active` unchanged until the user explicitly confirms. On confirmation, copy the candidate to active, mark it confirmed, clear candidate, and retain the previous active version in history.

## Calendar events

For drag, resize, create, or delete events, append the raw event first. Update the candidate plan. If the action edits an active plan, create a revised candidate rather than silently mutating active. Ask why when the answer could reveal a reusable preference. A single action is insufficient to establish a preference.

## Execution and interruption

Starting, pausing, switching, resuming, and completing a task updates `execution.json` and task progress. On interruption, preserve completed work, remaining work, current location, next action, open questions, reason, and desired resume time. Keep the same task ID.

## Learning

Capture direct stable statements as candidate observations with verbatim evidence and `source: user_self_report`. Capture repeated behavior with event IDs and `source: system_observed`. Ask the user before promotion. Store rejection so the same inference is not repeatedly proposed without new evidence.
