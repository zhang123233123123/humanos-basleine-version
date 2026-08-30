# Codebook v0.1

The codebook is intentionally split into descriptive episode fields and
interpretive candidate codes. It must be revised after team pilot coding.

## Descriptive episode fields

### `task_type`

The focal activity: writing, reading, problem solving, memorization, experiment,
data analysis, evaluation, or non-learning activity. Use the participant's
description; do not infer cognitive demand from the title alone.

### `episode_type`

Use one primary value from the typology in `methodology.md`. Do not code an
unstarted task as `execution_interruption`.

### `trigger_external`

An event outside the immediate task changes feasibility, including family
obligations, network loss, instructor availability, equipment access, or a new
urgent task.

### `trigger_person_state`

Fatigue, pain, low concentration, distress, boredom, or another self-reported
state changes feasibility. Record only what the participant reported; do not
diagnose a mental state.

### `trigger_task_state`

Unexpected difficulty, failed experiment, missing information, poor result, or
unclear next step changes feasibility.

### `immediate_action`

Continue, complete a smaller step, pause, switch, reschedule, abandon, or seek
an alternative resource/location.

### `recovery_strategy`

Direct continuation, rereading, reviewing notes, locating materials, reviewing
software progress, reconstructing reasoning, or replanning.

### `recovery_friction`

- `low`: progress is externally visible and continuation is direct;
- `medium`: brief review or reorientation is required;
- `high`: reasoning or task context must be substantially reconstructed;
- `not_observed`: no return occurred or the account is hypothetical;
- `unclear`: transcript does not support a judgement.

### `outcome`

Resumed, delayed, repeatedly interrupted, rescheduled, abandoned, or unresolved
at interview time.

## Recovery-context codes

### `checkpoint_progress`

Where the person stopped: page, item, experimental stage, paragraph, completed
portion, or percentage.

### `checkpoint_next_action`

The first concrete action on return. Distinguish an executable next action from
a general goal such as “continue writing.”

### `checkpoint_reason`

Why work stopped. Code separately from progress and next action. Also code
`negative_reason_reexposure` when resurfacing the reason may create emotional
burden.

### `checkpoint_material_pointer`

Links to documents, passages, data, references, equipment, or other artifacts
needed to resume.

### `checkpoint_reasoning_state`

Unfinished reasoning, explored alternatives, failed approaches, hypotheses, or
the intended structure of an answer.

## Adaptive-support codes

### `decision_point`

When support could occur: explicit pause, detected plan overrun, midpoint
progress check, end-of-block noncompletion, return to task, or user request.

### `tailoring_variable`

Information proposed for adapting support: remaining work, deadline risk,
future availability, current self-report, task type, task difficulty, historical
duration, or dependency state.

### `intervention_option`

Checkpoint, rest, continue, smaller step, switch, reschedule, reminder,
explanation, or resource suggestion.

### `low_risk_automation`

Saving progress, updating completion, recording time, or preparing a candidate
without changing a committed plan.

### `high_impact_confirmation`

Moving or deleting future work, changing priority, increasing workload, or
updating a durable preference requires explicit confirmation.

### `contestability`

Reject, edit, undo, preserve current plan, compare alternatives, or provide new
constraints.

### `decision_evidence`

The participant requests reasons, source data, historical observations,
deadline/workload calculations, or a visible change summary.

### `selective_memory`

The participant distinguishes useful durable patterns from private, sensitive,
one-off, or unwanted information.

## Candidate interpretive codes

### `planning_as_adaptation`

Planning is treated as ongoing adjustment rather than adherence to a fixed
calendar.

### `context_dependent_resumption`

Recovery cost depends on how much task state is visible outside the person's
working memory.

### `state_task_fit`

Participants match different tasks to perceived current capability rather than
using a universal high/low energy curve.

### `automation_control_tension`

Automation reduces effort but can threaten ownership when it changes goals or
committed plans.

### `support_as_burden`

Reminders, dashboards, repeated negative reasons, or rigid scheduling create
anxiety, pressure, or additional work.

### `non_need_or_self_sufficiency`

The participant reports little recovery difficulty or prefers unaided planning.
This is a boundary condition, not failed data.
