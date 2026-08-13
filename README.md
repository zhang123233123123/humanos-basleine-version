# HumanOS syy7

## Local teammate V4 experience

This folder is an isolated copy of the teammate `(4).zip`; it does not replace
the SYY V3 integration folder. Its onboarding form starts with editable sample
data, including a laundry + English podcast pair for parallel-scheduling tests.
Sample deadlines are generated for the next actionable planning week.

Start it on the dedicated V4 ports:

```powershell
cd "D:\TUe\OneDrive - TU Eindhoven\Humanos\humanos-v4-zhj"
powershell -ExecutionPolicy Bypass -File .\scripts\start_v4.ps1
```

Open `http://127.0.0.1:3040/login`. Create a new account, then move through the
four onboarding steps. Previously saved onboarding data in that browser takes
priority over the sample defaults; clear `humanos:onboarding-draft:v2` in Local
Storage or use a new account/browser profile if you want to see the defaults
again.

Stop V4 with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop_v4.ps1
```

The supplied teammate snapshot currently has six failing backend tests (five
prompt/schedule-contract expectations and one numbered-list parser case). The
frontend TypeScript check passes. These existing semantic differences were not
silently replaced with SYY V3 behavior.

HumanOS syy7 keeps the full v12 scheduling and recovery logic while introducing a lighter, four-page onboarding flow inspired by the strongest UI ideas in the teammate prototype.

## What is preserved

- DeepSeek proposes concrete weekly time blocks through the global-planning prompt.
- Python validates availability, fixed time, blocked time, deadlines, dependencies, buffer, overlap, and confirmed parallel groups.
- Exact task work is kept separate from 15-minute calendar capacity.
- Long tasks can be split into multiple sessions.
- Interrupted tasks keep the same task ID, progress, remaining work, and re-entry cue.
- Parallel sessions remain separate tasks and require explicit user confirmation.
- Momentary State changes only today's next-session choice: strong focus favors a ready high-priority demanding task, while low capacity favors a lighter task or a short checkpoint.
- Accepting a parallel suggestion regenerates the affected plan; Python rejects unconfirmed overlap, third-task overlap, incompatible resources, and off-grid time.

## What changed in syy7

Profile setup is divided into four short pages:

1. Study context
2. Working rhythm
3. Weekly boundaries
4. Tasks and today's check-in

The interface is English, removes low-value explanatory copy, and presents only the information needed at each decision point. Model provenance, raw prompt output, internal confidence, Context Window, Interruption History, and Resume Brief are not shown in the default plan review.

## Scheduling responsibility

```text
DeepSeek: task demand + dependencies + concrete Session times + semantic parallel candidates
Python: availability + fixed time + deadline + duration + dependency + 15-minute grid + overlap validation
User: adjust the draft if needed + optionally accept/reject parallel suggestions + confirm the whole validated plan once
```

Every Momentary State field sent to the planner must affect `next_session_selection` or be omitted. Python records `state_used`, `affected_decision`, and the selected first task internally so this can be tested without exposing debug data in the interface.

The current end-to-end UX, Finish/overrun policy, interruption states, and their mapping to computer-scheduling concepts are documented in [`docs/UX_FLOW_AND_COMPUTER_SCHEDULING.md`](docs/UX_FLOW_AND_COMPUTER_SCHEDULING.md).

## Local run

Create `backend/.env` from `.env.example`, then add your DeepSeek key.

```powershell
pip install -r backend/requirements.txt
python backend/humanos_server.py
python scripts/serve_frontend.py
```

Open `http://127.0.0.1:8766/index.html`.

## Data Foundry

Upload `data-foundry-share/humanos-data-foundry-syy7.html`. Append the active HTTPS backend address as the `api` query parameter.

```text
https://datafoundry.id.tue.nl/web/<token>/humanos-data-foundry-syy7.html?api=https://<your-tunnel>.trycloudflare.com
```

See `SYSTEM_COMPARISON.md` for the teammate-version comparison and the syy7 design rationale.
