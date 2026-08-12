# HumanOS V3 integration

This branch starts from the teammate V3 implementation and keeps its modular API, task, planning, execution, and memory structure. The changes connect that foundation to the lighter HumanOS interaction model discussed by the team.

## Planning responsibility

DeepSeek is asked to produce concrete session blocks rather than only commenting on a Python schedule. It receives the structured profile, weekly availability, protected activities, tasks, deadlines, dependencies, energy rhythm, and today's state. It creates three internal candidates and nominates one. Users see only the recommended candidate.

Python remains the deterministic safety layer. It validates availability, fixed events, deadlines, duration conservation, dependencies, session spacing, buffer, and authorized parallel overlap. Violations are returned to DeepSeek for repair. An unresolved hard constraint is shown as a concrete decision instead of a vague conflict count.

The prompt uses this lexicographic priority order:

1. Stay inside available windows and outside protected fixed time.
2. Finish all required work before its deadline.
3. Preserve task duration and explicit dependencies.
4. Respect task priority.
5. Match the stable energy rhythm.
6. Use today's state only for today's next session.
7. Respect session and break preferences.
8. Preserve buffer and reduce unnecessary switching.

## Parallel work

Parallel compatibility is evaluated between task pairs. A task-level flag alone never permits overlap. HumanOS can propose a low-conflict pair such as laundry plus low-demand English listening. The user chooses **Combine** or **Keep separate** in the single plan-review step. Python permits overlap only for the accepted pair, limits it to two activities, and rejects any third overlapping block.

## Interaction model

- Onboarding uses selectable days, browser time controls, emoji mood, 1–7 state sliders, and structured numeric time values.
- Flexible activities ask only for a name and approximate duration; HumanOS chooses their time inside availability.
- The draft is confirmed once as a whole. Individual ordinary tasks do not require separate approval.
- Session-end feedback uses automatically tracked time and shows only outcomes compatible with the real execution state.
- Insights are grouped into recent observations, emerging patterns, and confirmed preferences. Technical memory search remains available to the backend but is hidden from the normal product view.

## Source of truth

Production UI code is in `frontend/`. Production API code is in `backend/`. This branch was created in a separate worktree and does not modify the existing `humanos-syy7` working directory.
