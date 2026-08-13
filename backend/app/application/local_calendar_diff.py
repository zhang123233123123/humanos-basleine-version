"""Build a reviewable local Calendar Diff without mutating the active plan."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def build_local_calendar_diff(
    *,
    plan_id: str,
    plan_revision: int,
    week_id: str,
    execution_session: dict[str, Any],
    preferred_resume_at: str,
    affected_session_ids: list[str] | None = None,
) -> dict[str, Any]:
    start = datetime.fromisoformat(str(preferred_resume_at).replace("Z", "+00:00"))
    duration = max(int(execution_session.get("session_remaining_minutes") or execution_session.get("remaining_at_pause") or 0), 1)
    end = start + timedelta(minutes=duration)
    week_start = datetime.fromisoformat(f"{week_id}T00:00:00").replace(tzinfo=start.tzinfo)
    day_index = (start.date() - week_start.date()).days
    start_hour = start.hour + start.minute / 60
    end_hour = end.hour + end.minute / 60
    before = {
        "execution_session_id": execution_session.get("execution_session_id"),
        "task_id": execution_session.get("task_id"),
        "block_id": execution_session.get("block_id"),
        "start_at": execution_session.get("planned_start_at"),
        "end_at": execution_session.get("planned_end_at"),
        "planned_work_minutes": execution_session.get("planned_work_minutes"),
    }
    after = {
        **before,
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "day_index": day_index,
        "start": start_hour,
        "end": end_hour,
        "planned_work_minutes": duration,
        "source": "continue_later",
    }
    affected = sorted({str(item) for item in (affected_session_ids or []) if str(item)})
    return {
        "base_plan_id": plan_id,
        "base_plan_revision": int(plan_revision),
        "week_id": week_id,
        "scope": "local",
        "trigger": "continue_later",
        "status": "proposed",
        "changes": [{"type": "move_session", "before": before, "after": after}],
        "affected_execution_session_ids": affected,
        "protected_resources": ["completed_sessions", "running_history", "fixed_events", "unaffected_future_sessions"],
        "confirmation_required": True,
        "formal_calendar_changed": False,
    }


def apply_local_calendar_diff(plan_patch: list[dict[str, Any]], calendar_diff: dict[str, Any]) -> list[dict[str, Any]]:
    """Project a diff into a candidate patch; persistence remains a later step."""
    changes = {
        str(item.get("after", {}).get("block_id")): item.get("after", {})
        for item in calendar_diff.get("changes") or []
        if item.get("type") == "move_session" and item.get("after", {}).get("block_id")
    }
    projected = []
    for block in plan_patch:
        replacement = changes.get(str(block.get("block_id")))
        projected.append({**block, **replacement} if replacement else dict(block))
    return projected
