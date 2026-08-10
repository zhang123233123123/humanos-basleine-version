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
