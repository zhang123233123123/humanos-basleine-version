# Unified Test Clock and Accelerated Week QA

## Purpose

HumanOS has one test-only clock shared by the Python backend and browser UI. It verifies time-dependent behaviour without changing the operating-system clock and without using real waiting as an assertion mechanism.

Production behaviour is unchanged. The control endpoint and browser helper only exist when:

```text
HUMANOS_TEST_MODE=1
```

The deterministic starting point is:

```text
2026-08-03T08:45:00+08:00
```

## Test controls

The backend exposes `GET/POST /api/test-clock` in test mode. The browser exposes:

```javascript
await HumanOSTestClock.setTime("2026-08-03T09:00:00+08:00");
await HumanOSTestClock.advanceMinutes(15);
await HumanOSTestClock.advanceDays(1);
await HumanOSTestClock.setScale(15); // optional visual demo only
```

Automated assertions always use explicit `setTime`, `advanceMinutes`, or `advanceDays`. The optional scale means 15 simulated minutes per real second and is intended only for visual demonstrations.

The shared clock controls Today labels, `week_id`, Up Next countdowns, readiness, execution elapsed time, Daily Check-in dates, week rollover detection, and backend event timestamps.

## Deterministic dataset

`scripts/seed_unified_clock_qa.py` creates the specified Singapore profile, Google Calendar and Notion research-control fields, available windows, lunch, meeting, out-of-office period, buffer, five tasks, and a confirmed Laundry + English podcast parallel context pair.

The fixture uses fixed Plan blocks so the browser state-machine test is repeatable and can run offline. It is explicitly labelled `deterministic_browser_qa_fixture`; it does not claim that a live DeepSeek request occurred. Prompt/DeepSeek contract evaluation remains covered separately by the prompt tests and benchmark.

## Run the browser week

From the `humanos-syy7` folder:

```powershell
python scripts\build_data_foundry_share.py
& "C:\Users\SYY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\qa_unified_clock_week.mjs
```

The browser test covers:

- Daily Check-in once per local day;
- `Up Next · Starts in 15 min` at 08:45;
- `Starts in 1 min` at 08:59;
- `Ready to start` at 09:00 without automatic execution;
- explicit Start, 20 active minutes, Pause, frozen countdown, and Resume on the same Execution Session;
- Session ended without automatic Task completion;
- completed, partial, and not-started feedback;
- page refresh and server-backed state recovery after explicit login;
- Sunday 23:59 to Monday 00:00 week rollover detection.

## Run Plan v1 to v2 editing

After the browser run:

```powershell
$env:HUMANOS_TEST_MODE="1"
$env:HUMANOS_TEST_NOW="2026-08-06T08:00:00+08:00"
$env:HUMANOS_DB_PATH="$PWD\qa-artifacts\unified-clock-qa.db"
python scripts\simulate_plan_revision_qa.py
python scripts\export_unified_clock_qa.py
```

This verifies that a Deadline change preserves `task_id`, an illegal drag into Out of office is rejected, a legal move and Undo are recorded, the rationale is asked once, Plan v1 becomes `superseded`, Plan v2 becomes the only active confirmed Plan, and v1's unstarted Execution Sessions are retired rather than appearing beside v2.

## Artifacts

The scripts write only to `qa-artifacts/`:

- `unified-clock-01-...png` through `unified-clock-12-...png`;
- `unified-clock-before.db` and `unified-clock-after.db`;
- `unified-clock-timeline.json`;
- `unified-clock-report.json`;
- `unified-clock-plan-revision-report.json`;
- `unified-clock-plan-diff.json`;
- `unified-clock-plan-edit-events.json`;
- `unified-clock-execution-sessions.json`;
- `unified-clock-event-log.json`;
- `unified-clock-context-dumps.json`;
- `unified-clock-database-export.json`.

These artifacts demonstrate consistency among the visible UI mode, Task remaining work, Execution Session state, Plan revision, edit events, and simulated timestamps. QA databases and screenshots are intentionally excluded from the distributable ZIP.
