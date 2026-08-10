"""Pure Task creation policy."""

from __future__ import annotations

from typing import Any

from .aggregate import TaskAggregate, TaskExecutionState


def prepare_task_creation(
    *,
    task_id: str,
    user_id: str,
    title: str,
    domain_type: str,
    schedule_type: str,
    deadline: str | None,
    duration_minutes: int,
    priority: str,
    status: str,
    context: str,
    context_window: dict[str, Any],
    task_demand: dict[str, Any],
    cognitive_load: str,
    ambiguity: str,
    switch_cost: str,
    reentry_cost: str,
    execution: dict[str, Any] | None,
    resource_modality: list[str] | None,
    parallelizable: bool,
    expected_difficulty: str | None,
    week_id: str,
    timezone_name: str | None,
    start_at: str | None,
    deadline_at: str | None,
    deadline_assumption: str | None,
) -> TaskAggregate:
    normalized_window = {
        **context_window,
        "taskType": schedule_type,
        "deadline": deadline,
        "estimatedDuration": duration_minutes,
        "timezone": timezone_name or context_window.get("timezone"),
        "startAt": start_at or context_window.get("startAt"),
        "deadlineAt": deadline_at or context_window.get("deadlineAt"),
        "deadlineAssumption": deadline_assumption or context_window.get("deadlineAssumption"),
    }
    execution_state = execution or {
        "original_estimate_minutes": duration_minutes,
        "accumulated_actual_minutes": 0,
        "remaining_duration_minutes": duration_minutes,
        "progress_percent": 0,
        "sessions": [],
        "history_sessions": [],
    }
    execution_state.setdefault("history_sessions", [])
    return TaskAggregate(
        task_id=task_id,
        user_id=user_id,
        title=title,
        domain_type=domain_type,
        schedule_type=schedule_type,
        deadline=deadline,
        duration_minutes=duration_minutes,
        priority=priority,
        status=status,
        context=context,
        context_window=normalized_window,
        task_demand=task_demand,
        execution=TaskExecutionState.model_validate(execution_state),
        cognitive_load=cognitive_load,
        ambiguity=ambiguity,
        switch_cost=switch_cost,
        reentry_cost=reentry_cost,
        resource_modality=resource_modality or [],
        parallelizable=parallelizable,
        expected_difficulty=expected_difficulty,
        week_id=week_id,
    )
