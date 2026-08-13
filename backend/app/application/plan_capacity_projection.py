"""Project immutable scheduling constraints from a canonical plan timeline."""

from __future__ import annotations

from datetime import datetime
from typing import Any


def _minute(value: object, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def project_plan_capacity(
    plan: dict[str, Any],
    *,
    current_week_minute: int,
    current_execution_session_id: str = "",
) -> dict[str, Any]:
    timeline = dict(plan.get("weekly_timeline") or {})
    intervals = list(timeline.get("intervals") or [])
    if not intervals:
        intervals = [
            {
                **block,
                "id": block.get("block_id"),
                "source_id": block.get("block_id"),
                "week_start_minute": _minute(block.get("week_start_minute"), _minute(block.get("day_index")) * 1440 + round(float(block.get("start") or 0) * 60)),
                "week_end_minute": _minute(block.get("week_end_minute"), _minute(block.get("day_index")) * 1440 + round(float(block.get("end") or 0) * 60)),
            }
            for block in (plan.get("plan_patch") or [])
        ]
    future = [item for item in intervals if _minute(item.get("week_end_minute")) > current_week_minute]
    fixed = [item for item in future if item.get("kind") == "fixed_event" or item.get("movable") is False and not item.get("task_id")]
    explicit_buffer = [item for item in future if item.get("kind") == "rest_buffer"]
    buffer_minutes = sum(max(_minute(item.get("week_end_minute")) - max(_minute(item.get("week_start_minute")), current_week_minute), 0) for item in explicit_buffer)
    return {
        "plan_id": plan.get("plan_id"),
        "plan_revision": plan.get("plan_revision"),
        "week_id": plan.get("week_id"),
        "fixed_events": fixed,
        "fixed_event_interval_ids": [str(item.get("id") or item.get("source_id")) for item in fixed],
        "buffer_intervals": explicit_buffer,
        "buffer_minutes": buffer_minutes,
        "protected_interval_ids": [str(item.get("id") or item.get("source_id")) for item in fixed + explicit_buffer],
        "current_execution_session_id": current_execution_session_id,
    }


def annotate_future_sessions(sessions: list[dict[str, Any]], capacity: dict[str, Any]) -> list[dict[str, Any]]:
    fixed_ids = set(capacity.get("fixed_event_interval_ids") or [])
    return [
        {
            **session,
            "fixed_event": str(session.get("block_id") or "") in fixed_ids,
        }
        for session in sessions
    ]


def week_minute(current: datetime, week_id: str) -> int:
    week_start = datetime.fromisoformat(f"{week_id}T00:00:00")
    if current.tzinfo is not None:
        week_start = week_start.replace(tzinfo=current.tzinfo)
    return max(int((current - week_start).total_seconds() // 60), 0)
