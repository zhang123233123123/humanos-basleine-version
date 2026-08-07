# HumanOS Research Editing and Execution Implementation

## Scope

This increment extends the existing HumanOS profile, weekly-plan lifecycle, task/session model, Context Dump, and Execution Feedback. It does not rebuild the application and does not delete or recreate user tasks.

## Planning Background

`profiles.research_context_json` stores participant-reported planning background:

- `planning_tools[]`
- `primary_planning_tool`
- `planning_tool_use_frequency`
- `source = user_self_report`
- `captured_at`
- `revision`

The profile also stores `research_context_revision`. Every material update increments this revision. Plan-edit episodes and execution feedback record the revision that was current when the behavior occurred.

These fields are deliberately excluded from the scheduling context, scheduling Prompt, task priority, time selection, memory summaries, and learned-pattern inference.

## Plan-edit data model

### `plan_edit_episodes`

One row represents a user's editing period for one proposed plan revision. It stores the immutable initial snapshot/hash, final snapshot/hash, backend-computed canonical diff, status, research-context revision, and timestamps.

An episode is complete only when the user chooses **Add plan to calendar** or **Apply changes**. Idle time does not complete it.

### `plan_edit_events`

Committed interactions are recorded as ordered events. Supported events include moving/resizing/adding/removing sessions, metadata changes, alternative-plan selection, parallel decisions, undo, and failed attempts. Each event records actor, before/after state, input source, validation result, request ID, sequence number, and effectiveness. An undo references `reverts_event_id`.

The UI records a successful move or resize only after validation. A failed attempt may be stored with `effective=false`.

### Canonical diff

The backend compares the initial proposal with the final submitted plan. It classifies unchanged, moved, resized, added, removed, task-metadata, and parallel-decision changes. Moving a same-length block is not counted as resizing.

## Lightweight rationale

If the canonical diff is non-empty, final confirmation pauses once on an optional research card. The user can answer, skip, or return to editing. Responses are deduplicated by edit episode and final-plan hash.

Stored rationale data separates:

- observed change behavior;
- user self-report;
- parsed reason representation;
- `only_this_week`, `usually_true`, or `not_sure` generalizability.

No single rationale directly changes the static profile. Repeated evidence can later support a separate user-confirmed pattern proposal.

## Execution sessions

`execution_sessions` is the canonical session-level execution record. Its lifecycle is:

`ready -> running -> paused -> running -> ended -> completed/not_started`

- A planned time never starts a session automatically.
- **Start now** explicitly moves a session to `running`.
- Refresh restores the current running or paused session from the backend.
- The countdown displays session remaining time separately from task remaining work.
- Countdown passage does not reduce task work and does not complete the task.
- **Finish session** moves the session to `ended` and opens Execution Feedback.
- Feedback determines completed, partial, or not-started outcome and then updates task remaining work.
- Existing confirmed plans are lazily upgraded with `ready` execution sessions without regenerating the plan or user tasks.

## Files changed

- `backend/humanos_server.py`: migrations, research profile data, edit episodes/events, canonical diff, rationale gating, execution state machine, endpoints.
- `frontend/index.html`: planning-background fields, Now/Up next surface, rationale card.
- `frontend/app.js`: profile persistence, validated edit logging, rationale confirmation, execution controls and feedback link.
- `frontend/styles.css`: product UI styling for the new surfaces.
- `backend/test_research_edit_execution.py`: 24 focused tests.
- `data-foundry-share/humanos-data-foundry-syy7.html`: rebuilt single-file share.

## Verification

- JavaScript syntax: passed using bundled Node.js.
- Python compilation: passed.
- Backend suite: 92 tests passed, including 24 new focused cases.
- Browser automation at 1366x768 reached registration, all four setup pages, DeepSeek-backed scheduling, parallel review, confirmed calendar, and chat-based fixed-event update. Updated screenshots are in `qa-artifacts/`.

## Current limitations

- The long legacy browser script timed out after completing and capturing the confirmed chat-update stage because later selectors still expect the pre-rationale flow. The captured audits before timeout passed; the script should be refactored into shorter independent scenarios.
- Now/Up next currently presents one primary session. The backend allows a second explicitly confirmed parallel session, but a future UI refinement could show both active partners in the compact Now card.
- Repeated rationale evidence is stored safely, but the later 3-4 occurrence pattern-proposal UI remains a separate research feature.

## Confirmed-plan execution rail

The confirmed calendar now uses a dedicated execution rail instead of keeping
the draft-review controls on screen. Its user-facing states are `Up next`,
`Ready to start`, `Running`, `Paused`, `Session ended`, and `Today is clear`.
Starting work is always explicit; merely reaching a planned start or end time
does not change Task progress or completion.

The default confirmed view contains:

- the current or next work session, with one primary action;
- at most two later sessions for today;
- a compact daily and weekly summary, including protected buffer;
- a collapsed, user-readable explanation of the plan;
- the existing Ask HumanOS entry point.

When another calendar block is selected during active work, the rail keeps a
compact `NOW` strip above Task Details. Plan Review, Task Details, Ask HumanOS,
and Pause/Resume remain mutually exclusive rather than being stacked into a
single long control panel.

### Persistence and idempotency

`execution_sessions` stores accumulated active minutes and `resumed_at`, so a
refresh restores the same running or paused execution session. The new
`execution_requests` table deduplicates start, pause, resume, and end actions
by `(user_id, request_id)`. Execution Feedback also accepts a request ID and
uses a unique partial index to prevent double application.

The state machine is:

`ready -> running -> paused -> running -> ended -> completed/not_started`

Only submitted Execution Feedback changes Task remaining work. `Did not
start` records zero active work and leaves remaining work unchanged. A partial
outcome reduces remaining work only by the amount the user reports.

### Calendar synchronization

Calendar blocks now distinguish draft, confirmed, up-next, running, paused,
session-ended, completed, and missed states. Confirmed and running blocks stay
still; only draft or newly adjusted proposals retain the subtle draft motion.
Non-parallel execution is exclusive. A parallel start is accepted only for an
explicitly confirmed two-task parallel group; a third concurrent task is
rejected.

### Verification update

- Backend test suite: **115 tests passed**, including 22 focused confirmed-plan
  execution-rail checks.
- JavaScript syntax: passed with the bundled Node.js runtime.
- Focused browser QA covered 1366x768 and 1440x900, including Up Next, Running,
  selected-task compact NOW strip, Paused, and Session Ended states.
- Browser artifacts: `qa-artifacts/execution-rail-*.png` and
  `qa-artifacts/execution-rail-audit.json`.

### Remaining limitations

- The execution countdown is client-refreshed at minute precision; it is not a
  server-push timer.
- DeepSeek benchmark calls require external network access and a valid key.
  During offline verification the benchmark retried and timed out, while the
  deterministic fallback and all functional tests still passed.
- The single-file Data Foundry page needs the public HTTPS backend URL in its
  `api` query parameter for live AI and persisted execution behavior.

## Accelerated one-week simulation

`scripts/simulate_accelerated_week.py` advances a confirmed plan through seven
days by supplying explicit production-format timestamps. It does not change
the computer clock. The scenario covers seven Daily Check-ins, explicit starts,
one interruption with Context Dump and same-session resume, completed work,
partial work, a did-not-start outcome, idempotent action replays, Execution
Feedback, and week rollover.

The verified outcome was five completed Tasks and two unfinished Tasks. The
partial Task retained 25 minutes, the not-started Task retained all 45 minutes,
and both were carried into the next week. The previous Plan was superseded,
the repeating lunch routine was reused, and Daily Check-in state was reset for
the new week. The simulation also detected and fixed a lifecycle bug where an
explicit completed status could be overwritten by Task-Demand recalibration.
