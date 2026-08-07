# HumanOS local QA time controller

The QA controller is a local-only inspection tool built on the existing Unified Clock. It does not introduce a second time system.

## Start

From PowerShell in the `humanos-syy7` folder:

```powershell
.\scripts\start_local_qa.ps1
```

If PowerShell blocks local scripts, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_qa.ps1
```

If the normal HumanOS ports are already occupied:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_qa.ps1 -BackendPort 8797 -FrontendPort 8776
```

Open `http://127.0.0.1:8766/index.html` and log in with:

- Email: `clock-qa@example.com`
- Password: `testing123`

Stop the two local processes with:

```powershell
.\scripts\stop_local_qa.ps1
```

The launcher sets `HUMANOS_TEST_MODE=1`, `HUMANOS_QA_DB=1`, a separate `qa-local/humanos-qa.db`, and the snapshot directory. The controller and `/api/qa-scenarios*` routes are absent unless both QA flags are active. The generated `qa-local` directory is ignored by Git and excluded from the release ZIP.

## Use

Expand **QA Time Controller** at the top of the page.

- **Advance time only**: `+1m`, `+15m`, `+1h`, `+1 day`, custom forward time, and auto-play move only the Unified Clock. They never fabricate Start, Pause, Finish, or Feedback events.
- **Load independent scenario snapshot**: restores a separate SQLite snapshot and its matching simulated time. Use this for Running, Paused, Ended, feedback, plan revision, rationale, and backward travel.
- **Reset QA Scenario**: opens a confirmation dialog, requires its acknowledgement, and then asks for final browser confirmation before restoring the baseline.

Every change re-reads the backend profile, plan, tasks, execution state, daily check-in status, and week rollover status. The calendar and execution rail therefore use the same simulated instant as the backend.

## Presets

| Preset | Expected state |
| --- | --- |
| Session -15 min | 08:45, no execution action |
| Ready | 09:00, session ready but not started |
| Running 20 min | Explicit Start at 09:00, current time 09:20 |
| Paused | Explicit Start and Pause, current time 09:25 |
| Ended · feedback due | Explicit End, no feedback submitted |
| Partial feedback | Partial completion and remaining work saved |
| Plan edit | Task edit dialog opens on an isolated changed-plan snapshot |
| Rationale prompt | Optional research rationale dialog preview |
| Plan v2 confirmed | Revision 2 is active; old future sessions are superseded |
| Sunday 23:59 | One minute before rollover |
| New week | Monday 00:00; rollover remains a user decision |

## Safety boundary

Production startup does not set the two QA flags, uses the normal configured database, returns 404 for QA routes, and keeps the QA controller hidden. A direct backward call to `/api/test-clock` is rejected; backward movement is only permitted as part of snapshot restoration.

## Verified browser run

The automated Chrome run is `scripts/qa_time_controller.mjs`. It checks the visible controller, time-only safety, custom time, Running, Paused, backward snapshot restoration, Ended pending feedback, Partial feedback, confirmed plan v2, Sunday/New week, auto-play, and the two-step reset.

Latest result: **13/13 browser checks passed**, **123/123 backend tests passed**, and a production-mode probe returned **404** for `/api/qa-scenarios`.

Screenshots and the JSON report are generated under `qa-artifacts/time-controller/` and are intentionally excluded from the release ZIP.
