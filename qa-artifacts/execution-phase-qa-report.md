# HumanOS execution-phase QA report

Date: 2026-08-07  
Scope: `humanos-syy7` only

## Implemented behavior

- Active work is calculated from the persisted execution timeline: Start/Resume to Pause/End. Paused time is excluded.
- Pause, Resume and Feedback reuse the same `task_id` and `execution_session_id`.
- Feedback reads persisted active minutes and never adds them a second time.
- Pause asks only for a reason, one combined progress/next-step note, and a resume preference.
- A short pause creates a today-only continuation preview. Only affected future blocks are shifted; other dates remain unchanged.
- The local adjustment uses `Update today`. Confirming it preserves the paused execution session and its timeline.
- Resume immediately restores the running card, remaining minutes and saved next step.
- Session End choices depend on actual execution state. `Did not start` is hidden after any active work.
- Feedback returns to the execution rail rather than forcing Task Details open.
- Running and Paused sessions outrank old pending feedback in the right rail.
- Routine time is a movable preference. Without an explicit movement limit, it may move within the user's available window; it is not treated as a Fixed Event.
- Failed calendar drags revert immediately, show a short concrete toast and record only one `failed_edit_attempt`.
- Conflict records include task names, day/time, overlap minutes, reason and concrete remedies.

## Active-minute source of truth

For one Execution Session:

`active minutes = sum of every Start/Resume -> Pause/End interval`

For one Task:

`accumulated_actual_minutes = sum(execution_sessions.accumulated_active_minutes)`

Feedback never increments this value. It only interprets the persisted execution result and updates remaining work according to the selected outcome.

## Verified state transitions

`Ready -> Running -> Paused -> Running -> Ended -> Completed/Queued`

- Short pause: same Session, new resume timestamp, local today-only preview.
- Reschedule: same Task and saved history; only remaining work is proposed again.
- Completed feedback: remaining work becomes zero.
- Made progress: tracked work is retained and remaining work is updated.
- Worked, no progress: tracked time is retained but remaining work is not reduced.
- Did not start: available only when active minutes are zero.

## Automated results

- Python unit/integration suite: **142 tests passed**.
- Accelerated-week simulation: **7 days**, **7 check-ins**, **7 feedback records**, Tuesday pause/resume on the same Session, Wednesday partial progress, Thursday not-started, and successful new-week rollover.
- Browser QA at 1366x768 and 1440x900: Start, 20-minute run, Pause, context save, 10-minute resume choice, `Update today`, Resume, Session End, partial-feedback follow-up and unstarted-expired state all passed.
- JavaScript syntax check passed.

## Screenshot index

- `execution-rail-pause-dialog-tracked-time.png` — auto-tracked Pause dialog with no manual-minute field.
- `execution-rail-pause-saved-calendar.png` — local continuation draft and `Update today`.
- `execution-rail-resumed.png` — resumed same Session with 25 minutes remaining.
- `execution-rail-session-ended.png` — state-driven Session End choices.
- `execution-rail-progress-followup.png` — conditional Progress and Next Step follow-up.
- `execution-rail-unstarted-expired.png` — zero-active session showing only Did not start / Start now.

## Remaining prototype limits

- The today-only pause repair is deliberately conservative: it cascades future not-started blocks forward on the same day and stops for a concrete user decision if no valid slot remains. It does not globally optimize the week.
- A Routine without an explicit movement boundary may move anywhere inside that day's user-provided availability; a future version could ask for a semantic range such as “around lunch”.
- Historical worked and paused intervals are persisted in the execution timeline and summarized on the calendar card; the calendar does not yet draw each historical interval as a separate colored sub-block.
- Temporary Cloudflare URLs and Data Foundry hosting remain deployment concerns and are not part of this local QA run.
