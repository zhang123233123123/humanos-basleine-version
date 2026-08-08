# HumanOS AI Development Guide

## 1. Project goal

This repository contains the HumanOS product. AI coding agents must treat the root-level frontend and backend as the only production application:

- Frontend: `frontend/`
- Backend: `backend/`
- Frontend framework: Next.js 14, React, TypeScript, Tailwind CSS
- Backend framework: Python standard-library `ThreadingHTTPServer`
- Persistence: SQLite
- Local frontend URL: `http://localhost:3000`
- Local backend URL: `http://localhost:8787`

Do not develop against the old copies under `calendar-ai/`, `calendar-ai/backend/`, `calendar-ai/frontend/`, `calendar-ai/fluid-calendar/`, or `calendar-ai/humanos-syy7(1)/`. They are reference copies, not the production paths.

## 2. Source of truth

The root `backend/humanos_server.py` is the source of truth for backend behavior and API contracts. The root `frontend/src/` is the source of truth for the user interface.

Before implementing a feature, map all of the following:

1. User-facing workflow.
2. Backend endpoint and HTTP method.
3. Request fields.
4. Response fields.
5. Loading, empty, success, and error states.
6. Whether the action changes persistent data.

Do not invent frontend-only behavior when the backend already owns that behavior. Do not silently add fallback mock data when a backend request fails.

## 3. Collaboration rule

For new pages, major workflow changes, API contract changes, authentication changes, or destructive file operations:

1. Analyze the existing implementation first.
2. Present the proposed page, API mapping, and affected files.
3. Wait for explicit user confirmation.
4. Implement only the confirmed scope.

Small bug fixes may be implemented directly when their intended behavior is unambiguous.

Do not rush into code changes. Do not replace working product behavior merely to simplify implementation.

## 4. Frontend-to-backend connection

The Next.js frontend must call its own same-origin `/api/*` route handlers. Those route handlers proxy requests to the Python backend using:

```env
HUMANOS_BACKEND_URL=http://localhost:8787
```

Browser components should not call `http://localhost:8787` directly. This keeps authentication, error normalization, and cross-origin behavior inside the Next.js server layer.

The backend defaults to port `8787` when `PORT` is not set. If deployment supplies `PORT`, configure `HUMANOS_BACKEND_URL` to the deployed backend URL rather than assuming localhost.

## 5. Product navigation

The intended HumanOS application navigation is:

```text
HumanOS
├── Workspace
├── Weekly Plan
├── Tasks
├── Focus
├── Insights
└── Settings
```

State check-in should normally be available as a global action. QA controls must only appear in test or QA mode.

## 6. Page and API mapping

### Authentication

Pages:

- `/login`
- `/register`

Backend APIs:

- `POST /api/auth/register`
- `POST /api/auth/login`

The current frontend uses NextAuth while the Python backend also exposes authentication endpoints. Do not redesign or merge these systems without explicit approval. In the short term, all backend requests must consistently identify the same signed-in user. Avoid introducing additional user identity formats.

### Workspace

Page:

- `/app`

Responsibilities:

- HumanOS conversation
- Calendar and scheduled task blocks
- Current task summary
- Quick execution controls
- Re-entry assistance after interruption

Backend APIs:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`
- `POST /api/chat/turn`
- `GET /api/chat/turns`
- `GET /api/execution-sessions/current`
- `POST /api/reentry`

### Tasks

Pages:

- `/app/tasks`
- `/app/tasks/{task_id}`

Backend APIs:

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/{task_id}`
- `PATCH /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`
- `POST /api/tasks/parse`

The task UI must support backend statuses such as `queued`, `scheduled`, `running`, `paused`, `completed`, `blocked`, and `terminated`. Preserve backend task IDs. Preview tasks must be visibly distinct and must not be treated as persisted tasks until the backend confirms creation.

### Weekly Plan

Pages:

- `/app/plan`
- `/app/plan/setup`

Backend APIs:

- `GET /api/weeks/status`
- `POST /api/weekly-setup/reconcile`
- `POST /api/schedules/decide`
- `POST /api/schedules/validate`
- `POST /api/schedules/confirm`
- `GET /api/plans/active`
- `POST /api/weeks/rollover`

Required workflow:

```text
Check week status
-> collect missing setup information
-> generate a candidate schedule
-> allow user review and edits
-> validate constraints
-> ask for explicit confirmation
-> display the active plan on the calendar
```

Never present an unconfirmed candidate schedule as the active plan.

### Focus execution

Page:

- `/app/focus`

Backend APIs:

- `GET /api/execution-sessions`
- `GET /api/execution-sessions/current`
- `POST /api/execution-sessions/start`
- `POST /api/execution-sessions/pause`
- `POST /api/execution-sessions/end`
- `POST /api/execution-feedback`
- `POST /api/state-transitions`

The frontend should distinguish task status from execution-session status. Timers displayed in the UI must be based on backend timestamps and persisted session state, not only component-local timers.

### State check-in and context dump

UI:

- Global state check-in action
- Optional `/app/check-in` page

Backend APIs:

- `POST /api/state-checkins`
- `POST /api/context-dumps`
- `POST /api/reentry`

The interface should allow users to report energy, fatigue, stress, focus difficulty, availability, environment, and free-form context without presenting inferred mental states as facts.

### Insights and memory

Page:

- `/app/insights`

Backend APIs:

- `GET /api/patterns/candidates`
- `POST /api/patterns/promote`
- `GET /api/memories/search`

Candidate behavioral patterns must be labeled as unconfirmed observations. The user must explicitly confirm a pattern before the UI presents it as a learned personal preference.

### Profile and settings

Pages:

- `/app/settings`
- `/app/settings/profile`
- `/app/settings/preferences`

Backend APIs:

- `GET /api/profile`
- `PUT /api/profile`

Timezone and scheduling preferences must use the backend representation. Avoid maintaining a second incompatible preference model only in local storage.

### QA tools

Page:

- `/app/qa`

Backend APIs:

- `GET /api/test-clock`
- `POST /api/test-clock`
- `GET /api/qa-scenarios`
- `POST /api/qa-scenarios/load`
- `POST /api/qa-scenarios/reset`

These routes and controls are test-only. Hide them when the backend health response does not report the required test or QA mode.

## 7. Background and internal API behavior

Not every backend endpoint needs a standalone page:

- `GET /api/health` should drive backend availability and capability state.
- `POST /api/plan-edits/events` should record meaningful user plan edits in the background.
- `POST /api/state-transitions` should be called when a real state transition occurs.
- `POST /api/schedules/validate` should validate user schedule edits before confirmation.
- `POST /api/weeks/rollover` should run through an explicit or clearly communicated week transition.

Background event failures should be observable during development but should not falsely report that the primary user action succeeded when persistence failed.

## 8. API route conventions

Place frontend proxy handlers under `frontend/src/app/api/`.

Each proxy handler should:

1. Resolve the signed-in user consistently.
2. Validate required input before forwarding.
3. Forward the correct method, query parameters, and JSON body.
4. Preserve meaningful backend HTTP status codes.
5. Normalize backend errors into a consistent frontend error shape.
6. Avoid returning fake success data.

Prefer shared API client and contract modules over duplicating fetch, date conversion, status normalization, and error handling in every route.

## 9. Data contract rules

- Use stable backend IDs for users, tasks, plans, sessions, and patterns.
- Keep `snake_case` at the backend boundary unless a documented adapter converts it.
- Centralize conversion between backend records and FullCalendar events.
- Preserve timezone offsets when parsing or serializing dates.
- Do not infer a deadline from a start time or a start time from a deadline without an explicit product rule.
- Do not silently default missing AI-extracted fields to invented values.
- Keep candidate, preview, confirmed, active, completed, and deleted states distinct.
- Treat backend validation errors as user-correctable errors where appropriate.

## 10. User experience requirements

Every backend-connected screen must define:

- Initial loading state
- Empty state
- Backend unavailable state
- Validation error state
- Permission or authentication error state
- Successful persistence feedback
- Retry behavior where safe

Optimistic UI is allowed only when rollback behavior is clear. Never leave the calendar showing a successful edit after the backend rejected it.

## 11. Implementation order

Unless the user requests a different priority, work in this order:

1. Stabilize authentication identity and shared API contracts.
2. Stabilize task CRUD and calendar synchronization.
3. Implement weekly setup, schedule generation, validation, and confirmation.
4. Implement execution sessions and feedback.
5. Implement state check-in, context dump, and re-entry.
6. Implement insights, candidate patterns, and memory search.
7. Implement QA-only controls.

Complete one vertical workflow at a time. A vertical workflow includes its page, proxy route, backend contract, loading and error states, and persistence behavior.

## 12. Change discipline

- Keep changes inside the root `frontend/` and `backend/` unless explicitly requested otherwise.
- Do not edit generated `.next/`, `node_modules/`, SQLite database files, or nested `.git/` directories.
- Do not commit secrets or copy existing `.env` files from reference projects.
- Update `.env.example` when a new environment variable is introduced.
- Do not change backend ports independently from frontend configuration.
- Do not duplicate the Python backend inside the frontend project.
- Do not add mock API success fallbacks to production paths.
- Preserve existing user changes and unrelated worktree modifications.

## 13. Definition of done

A feature is complete only when:

1. Its user workflow matches an existing backend capability or an approved backend change.
2. Frontend proxy and backend endpoint agree on method, fields, statuses, and errors.
3. The UI represents persisted backend state rather than temporary local state.
4. Loading, empty, success, and failure behavior are implemented.
5. Candidate and confirmed data are not conflated.
6. Any new environment configuration is documented.
7. The user has approved any material product or contract decision.
