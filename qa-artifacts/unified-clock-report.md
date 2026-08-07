# HumanOS Unified Clock QA Report

Date: 2026-08-07

## Result

PASS. The browser and backend used one explicit simulated clock across 14 checkpoints. The browser run completed in 8.8 seconds, produced 12 screenshots, and did not alter the operating-system clock.

## Browser checkpoints

- Daily Check-in appeared on the first local entry and did not repeat after refresh on the same day.
- Monday 08:45 showed `Up Next` and `Starts in 15 min`.
- Monday 08:59 showed `Starts in 1 min`.
- Monday 09:00 showed `Ready to start`; the Session remained `ready` until the user clicked Start.
- Start saved the same `execution_session_id` and an `actual_start_at` timestamp from the simulated clock.
- After 20 active minutes, the 45-minute Session showed 25 minutes remaining.
- Pause froze the Session countdown for a simulated 15 minutes and saved Progress and Next Step in a Context Dump.
- Resume reused the same Task and Execution Session.
- Reaching the planned work duration showed `Session ended` without completing the Task before feedback.
- Completed, partially completed, and not-started feedback records were stored with distinct remaining-work outcomes.
- An explicit page refresh plus login recovered server-backed execution state and did not repeat the Daily Check-in.
- Sunday 23:59 to Monday 00:00 changed `week_id` from `2026-08-03` to `2026-08-10` and displayed the rollover UI.

## Plan revision checkpoints

- T1 retained the same `task_id` after its Deadline changed.
- A drag into Thursday Out of office was rejected and recorded as ineffective.
- A legal move was recorded and an Undo event reverted it.
- Applying the final edit produced a canonical Plan Diff.
- The edit rationale was recorded once.
- Plan v1 became `superseded`; Plan v2 became the only active `confirmed` Plan.
- Six v2 future Sessions are `ready`; no v1 future Session remains `ready`.
- Historical completed/ended Session and feedback data remained in the database.

## Regression

122 backend tests passed. This includes the shared clock, structured availability, explicit execution state machine, idempotency, plan lifecycle, prompt contracts, weekly rollover, and retirement of old future Sessions after a revision.

## Important scope note

The browser week uses a deterministic offline Plan fixture so time-state assertions remain reproducible. It is labelled accordingly and does not claim a live DeepSeek call. DeepSeek prompt contracts and benchmark tests remain separate. Python still validates hard constraints for both generated and edited Plan blocks.
