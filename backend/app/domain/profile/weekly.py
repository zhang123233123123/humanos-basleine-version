"""Ownership rules for Profile-owned Weekly Context."""

from __future__ import annotations

from typing import Any


TASK_OWNED_WEEKLY_KEYS = frozenset({
    "current_tasks",
    "task_deadlines",
    "managed_task_ids",
    "confirmed_plan_summary",
    "task_slots",
    "execution_sessions",
})


def sanitize_weekly_context(context: dict[str, Any] | None) -> dict[str, Any]:
    """Remove concrete Task/Plan copies from the Profile aggregate."""
    return {
        key: value
        for key, value in dict(context or {}).items()
        if key not in TASK_OWNED_WEEKLY_KEYS
    }


def _clock_minutes(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return round(float(value) * 60) if 0 <= float(value) <= 24 else None
    parts = str(value or "").strip().split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return None
    hour, minute = int(parts[0]), int(parts[1])
    if hour == 24 and minute == 0:
        return 1440
    return hour * 60 + minute if hour <= 23 and minute <= 59 else None


def validate_context_items(context: dict[str, Any] | None) -> None:
    """Reject Profile activities that cannot be interpreted by scheduling."""
    for index, item in enumerate((context or {}).get("context_items") or []):
        if not isinstance(item, dict):
            raise ValueError(f"context_items[{index}] must be an object")
        kind = str(item.get("type") or item.get("category") or "")
        if kind not in {"fixed_event", "recurring_routine", "flexible_activity"}:
            raise ValueError(f"context_items[{index}].type is invalid")
        if not str(item.get("title") or "").strip():
            raise ValueError(f"context_items[{index}].title is required")
        if not str(item.get("day") or "").strip() and not item.get("days"):
            raise ValueError(f"context_items[{index}].day is required")
        raw_start, raw_end = item.get("start"), item.get("end")
        has_start = raw_start is not None and raw_start != ""
        has_end = raw_end is not None and raw_end != ""
        if kind in {"fixed_event", "recurring_routine"} and not (has_start and has_end):
            raise ValueError(f"context_items[{index}] requires start and end")
        if has_start != has_end:
            raise ValueError(f"context_items[{index}] must provide both start and end")
        if has_start:
            start, end = _clock_minutes(raw_start), _clock_minutes(raw_end)
            if start is None or end is None:
                raise ValueError(f"context_items[{index}] has an invalid time")
            if end <= start:
                raise ValueError(f"context_items[{index}].end must be after start")
        if kind == "flexible_activity" and int(item.get("duration_minutes") or 0) <= 0:
            raise ValueError(f"context_items[{index}].duration_minutes must be positive")
