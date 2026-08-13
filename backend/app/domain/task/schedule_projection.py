"""Projection rules from confirmed plan blocks onto a Task aggregate."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TaskScheduleProjection:
    slot: dict[str, Any] | None
    execution: dict[str, Any]
    status: str


def project_confirmed_task_schedule(
    task: dict[str, Any],
    *,
    sessions: list[dict[str, Any]],
    week_id: str,
    revision: int,
) -> TaskScheduleProjection:
    """Calculate the Task view of one confirmed Plan Revision."""
    ordered = sorted(sessions, key=lambda item: (item["start_at"], item["end_at"]))
    execution = dict(task.get("execution") or {})
    if not ordered:
        execution["scheduled_duration_minutes"] = 0
        remaining = int(execution.get("remaining_duration_minutes", task.get("duration") or 0))
        execution["unallocated_schedule_minutes"] = max(remaining, 0)
        return TaskScheduleProjection(slot=None, execution=execution, status="queued")

    projected_sessions: list[dict[str, Any]] = []
    for index, source in enumerate(ordered):
        session = dict(source)
        session["session_index"] = index + 1
        session["session_count"] = len(ordered)
        projected_sessions.append(session)

    scheduled_minutes = sum(
        int(
            item.get("planned_work_minutes")
            or item.get("session_minutes")
            or round((float(item["end"]) - float(item["start"])) * 60)
        )
        for item in projected_sessions
    )
    remaining_minutes = int(execution.get("remaining_duration_minutes", task.get("duration") or 0))
    execution["scheduled_duration_minutes"] = scheduled_minutes
    execution["unallocated_schedule_minutes"] = max(remaining_minutes - scheduled_minutes, 0)
    status = "scheduled" if execution["unallocated_schedule_minutes"] == 0 else "partially_scheduled"
    slot = {
        "sessions": projected_sessions,
        "start": projected_sessions[0]["start"],
        "end": projected_sessions[0]["end"],
        "day_index": projected_sessions[0]["day_index"],
        "week_id": week_id,
        "plan_revision": revision,
        "plan_status": "confirmed",
        "color": projected_sessions[0].get("color") or "blue",
    }
    return TaskScheduleProjection(slot=slot, execution=execution, status=status)
