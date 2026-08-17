"""Pure Task creation policy."""

from __future__ import annotations

import re
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
    attention_mode: str | None,
    parallelizable: bool,
    expected_difficulty: str | None,
    week_id: str,
    timezone_name: str | None,
    start_at: str | None,
    deadline_at: str | None,
    deadline_assumption: str | None,
) -> TaskAggregate:
    priority_aliases = {
        "high": "高",
        "medium": "中",
        "low": "低",
        "高": "高",
        "中": "中",
        "低": "低",
    }
    normalized_priority = priority_aliases.get(str(priority).strip().lower(), "中")
    # Older parsers used deadline_at for the single absolute timestamp of a
    # fixed event. Normalize that transport detail at the aggregate boundary.
    has_absolute_time = bool(start_at or deadline_at or context_window.get("startAt"))
    event_title = bool(re.search(
        r"(?:会议|开会|组会|约会|面试|课程|上课|meeting|appointment|interview|class)",
        title,
        re.IGNORECASE,
    ))
    normalized_schedule_type = (
        "flexible_task"
        if schedule_type == "fixed_event" and not has_absolute_time and not event_title
        else schedule_type
    )
    normalized_start_at = (
        start_at
        or context_window.get("startAt")
        or (deadline_at if normalized_schedule_type == "fixed_event" else None)
        or (deadline if normalized_schedule_type == "fixed_event" else None)
    )
    normalized_window = {
        **context_window,
        "taskType": normalized_schedule_type,
        "deadline": deadline,
        "estimatedDuration": duration_minutes,
        "timezone": timezone_name or context_window.get("timezone"),
        "startAt": normalized_start_at,
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
    from .resource_profile import normalize_attention_mode, normalize_resource_tags

    return TaskAggregate(
        task_id=task_id,
        user_id=user_id,
        title=title,
        domain_type=domain_type,
        schedule_type=normalized_schedule_type,
        deadline=deadline,
        duration_minutes=duration_minutes,
        priority=normalized_priority,
        status=status,
        context=context,
        context_window=normalized_window,
        task_demand=task_demand,
        execution=TaskExecutionState.model_validate(execution_state),
        cognitive_load=cognitive_load,
        ambiguity=ambiguity,
        switch_cost=switch_cost,
        reentry_cost=reentry_cost,
        resource_modality=normalize_resource_tags(resource_modality),
        attention_mode=normalize_attention_mode(attention_mode),
        parallelizable=parallelizable,
        expected_difficulty=expected_difficulty,
        week_id=week_id,
    )
