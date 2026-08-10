# HumanOS product frontend

`product-frontend/` is the staged product UI integration. It borrows the
component architecture and calendar presentation from the teammate reference,
while the SYY7 Python backend remains the source of truth for tasks, plans,
execution sessions, validation, memory, and DeepSeek scheduling.

The existing `frontend/` and `data-foundry-share/` entry points remain the
portable SYY7 experience. They share the current streamlined planning flow,
HumanOS visual language, floating navigation dock, and in-page assistant pet.

## Local setup

Install Node.js, then install the frontend dependencies once:

```powershell
cd "D:\TUe\OneDrive - TU Eindhoven\Humanos\humanos-syy7\product-frontend"
npm install
```

Keep the existing `backend/.env` file for the DeepSeek key. Do not copy the key
into the frontend.

Start both services:

```powershell
cd "D:\TUe\OneDrive - TU Eindhoven\Humanos\humanos-syy7"
powershell -ExecutionPolicy Bypass -File .\scripts\start_product_ui.ps1
```

Default URLs:

- Product UI: `http://127.0.0.1:3000`
- Python health check: `http://127.0.0.1:8787/api/health`

If a port is occupied:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_product_ui.ps1 -BackendPort 8797 -FrontendPort 3010
```

## Confirmed-plan lifecycle

The product UI follows the SYY7 lifecycle:

1. DeepSeek proposes a complete plan.
2. Python validates hard constraints.
3. The user reviews one recommended draft.
4. `Add plan to calendar` confirms the first plan.
5. A later calendar drag creates a reviewable revision; it does not mutate the
   confirmed calendar.
6. `Apply changes` confirms a valid revision, while `Keep current plan` cancels
   it.

Invalid drag attempts are reverted immediately and never create a pending
conflict or replace the valid confirmed plan.

## Current integration boundary

- Ready: Next.js shell, FullCalendar, authentication pages, same-origin API
  proxy, weekly planning, task metadata editing, confirmed-plan revisions, and
  plan-owned Focus execution sessions with automatically tracked active time.
- Still staged: per-user QA diagnostics in the product shell. The original
  local QA controller remains available through the existing frontend.
- The teammate backend and its direct adjust-and-confirm behavior are not used.
