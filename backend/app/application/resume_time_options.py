"""Validate a requested resume time and suggest deterministic alternatives."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def _overlap(start: datetime, end: datetime, other_start: datetime, other_end: datetime) -> bool:
    return start < other_end and end > other_start


def evaluate_resume_time(
    *,
    preferred: datetime,
    duration_minutes: int,
    week_id: str,
    available_windows: list[dict[str, Any]],
    occupied_sessions: list[dict[str, Any]],
    timezone,
) -> dict[str, Any]:
    week_start = datetime.fromisoformat(week_id).replace(tzinfo=timezone)
    duration = timedelta(minutes=max(int(duration_minutes), 1))
    if preferred.tzinfo is None:
        preferred = preferred.replace(tzinfo=timezone)
    preferred = preferred.astimezone(timezone)

    occupied: list[tuple[datetime, datetime, dict[str, Any]]] = []
    for item in occupied_sessions:
        try:
            start = datetime.fromisoformat(str(item.get("planned_start_at") or "").replace("Z", "+00:00"))
            end = datetime.fromisoformat(str(item.get("planned_end_at") or "").replace("Z", "+00:00"))
            occupied.append((start.astimezone(timezone), end.astimezone(timezone), item))
        except (TypeError, ValueError):
            continue

    def conflicts_at(start: datetime) -> list[dict[str, Any]]:
        end = start + duration
        day_index = (start.date() - week_start.date()).days
        hour = start.hour + start.minute / 60
        end_hour = hour + duration.total_seconds() / 3600
        conflicts: list[dict[str, Any]] = []
        if day_index not in range(7):
            conflicts.append({"type": "outside_current_week"})
        if not any(int(window.get("day_index", -1)) == day_index and float(window.get("start", 0)) <= hour and float(window.get("end", 0)) >= end_hour for window in available_windows):
            conflicts.append({"type": "outside_available_window"})
        for other_start, other_end, item in occupied:
            if _overlap(start, end, other_start, other_end):
                conflicts.append({"type": "session_overlap", "execution_session_id": item.get("execution_session_id"), "task_id": item.get("task_id"), "start_at": other_start.isoformat(), "end_at": other_end.isoformat()})
        return conflicts

    conflicts = conflicts_at(preferred)
    alternatives: list[str] = []
    cursor = preferred.replace(second=0, microsecond=0)
    minute_mod = cursor.minute % 15
    if minute_mod:
        cursor += timedelta(minutes=15 - minute_mod)
    for _ in range(7 * 24 * 4):
        if cursor > preferred and not conflicts_at(cursor):
            alternatives.append(cursor.isoformat())
            if len(alternatives) == 3:
                break
        cursor += timedelta(minutes=15)
    return {"valid": not conflicts, "preferred_resume_at": preferred.isoformat(), "conflicts": conflicts, "alternatives": alternatives, "checked_by": "python_resume_time_policy"}
