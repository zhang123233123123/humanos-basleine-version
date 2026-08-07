# HumanOS syy7 implementation report

## Scope

This version continues the existing HumanOS architecture. It does not rebuild
the product, delete user data, or recreate every Task during Weekly Setup.
The source of truth is this `humanos-syy7` folder; the earlier
`humanos-server-prototype-main` folder is not part of this release.

## Planning responsibilities

- DeepSeek interprets task demand and dependencies, proposes concrete Session
  times, explains the recommended plan, and identifies semantic parallel
  opportunities.
- Python validates availability, protected time, deadlines, dependencies,
  work totals, the 15-minute grid, overlap, buffer, and confirmed parallel
  groups. Invalid model output is returned to DeepSeek for a bounded repair
  loop rather than silently accepted.
- The user adjusts a Draft plan and confirms the complete plan once with
  `Add plan to calendar`.

## Persistent identity and plan lifecycle

- Weekly Setup reconciliation preserves a Task ID when the logical task still
  exists. Updates are applied field by field.
- Removed weekly tasks are archived rather than physically deleted, retaining
  progress, feedback, interruption context, memory links, and audit history.
- Plans use `proposed`, `confirmed`, `needs_update`, and `superseded` states,
  with a revision number and active-plan pointer.
- Confirmed Sessions keep absolute `start_at`, `end_at`, `week_id`, and
  `plan_revision` values.
- Editing scheduling-relevant fields invalidates affected future planning
  state without erasing past execution history.

## Drafts and decisions

- A Draft block is an AI proposal: dashed, lightly animated, editable, and not
  an error. Ordinary Draft blocks do not require per-task confirmation.
- `Needs your decision` is reserved for a concrete unresolved problem such as
  work that cannot fit before a deadline, a remaining hard conflict, or a
  critical ambiguity.
- Optional parallel suggestions do not block confirmation. If unanswered, the
  safe default is `Keep separate`.
- Mandatory decisions name the problem and offer bounded choices such as
  `Add available time`, `Move deadline`, or `Reduce scope`.

## Interface state model

The right rail is mutually exclusive: it shows Plan Review, Task Details, Ask
HumanOS, or the local Pause/Resume interaction—not a vertical stack of all
four. The default legend contains only Work, Protected time, and Buffer.
Conflict and Parallel pair appear only when present. Draft and Confirmed are
distinguished by dashed and solid borders.

Each major state has one primary action:

- Draft plan: `Add plan to calendar`.
- Editing a confirmed plan: `Apply changes`.
- Confirmed calendar: no plan-confirmation button.

Calendar and right rail each have at most one vertical scroll area. Decision
cards do not add nested scrolling, and the main right-rail action remains
reachable at 1366×768.

## Daily state and interruption

The Momentary State entered during first setup counts as that day's Daily
Check-in. The same Focus, Energy, Stress, and Mood form is not shown again
until the next day. Current state is required to affect today's next-session
selection or be omitted from the scheduling explanation.

Pause keeps the same Task identity and stores current progress, the next step,
remaining work, and the re-entry cue. It opens near the task instead of
exposing Context Window, Interruption History, or Resume Brief as permanent UI
panels.

## Verification

Automated tests cover prompt contracts, task parsing, scheduling constraints,
stable reconciliation, plan idempotency and revisioning, Daily Check-in,
week rollover, Draft-versus-Decision semantics, safe parallel defaults,
mutually exclusive right-rail modes, compact legend, and scroll constraints.

The browser QA script rebuilds and opens the exact Data Foundry single-file
artifact at 1366×768. It checks onboarding persistence, calendar rendering,
Daily Check-in behavior, schedule review, parallel pairing, confirmation,
interruption/re-entry when a backend is supplied, and English task parsing.

## Packaging and secrets

`scripts/package_syy7.ps1` first rebuilds the embedded Data Foundry HTML and
then creates `humanos-syy7.zip`. The archive excludes `.env`, SQLite databases,
Python caches, and QA artifacts. The DeepSeek key must stay only in
`backend/.env` on the machine running the backend.

## Confirmed-plan execution update

After a plan is confirmed, the right rail now switches from plan review to a
compact execution surface. It restores Up Next, Running, Paused, and Session
Ended state from the backend; keeps session remaining time separate from Task
remaining work; and requires explicit Start and user feedback before changing
Task progress. Selecting another calendar item while work is running preserves
a compact NOW strip above Task Details.

The backend adds resumable execution timestamps and idempotent execution action
records. The calendar visually synchronizes confirmed, running, paused, ended,
completed, missed, and draft states. Twenty-two focused acceptance tests were
added, bringing the complete backend suite to 115 passing tests. Focused
browser QA covers 1366x768 and 1440x900 layouts.

An accelerated seven-day simulation now verifies the production execution
methods without changing system time. It covers Daily Check-in, start,
pause/context-save/resume, end, feedback, idempotent retries, partial and
not-started outcomes, and week rollover. Five Tasks completed and the two
unfinished Tasks were carried forward with correct remaining work.
