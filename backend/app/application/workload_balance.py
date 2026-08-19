"""Descriptive workload-balance metrics for feasible schedule candidates."""

from __future__ import annotations

from typing import Any, Iterable


def eligible_workload_days(
    available_days: Iterable[int],
    deadline_days: Iterable[int | None],
    today_index: int,
) -> set[int]:
    """Return days where at least one active task can legally be scheduled."""
    usable = {int(day) for day in available_days if today_index <= int(day) <= 6}
    deadlines = list(deadline_days)
    return {
        day
        for day in usable
        if any(deadline is None or day <= int(deadline) for deadline in deadlines)
    }


def workload_balance_metrics(
    sessions: Iterable[dict[str, Any]],
    eligible_days: Iterable[int],
) -> dict[str, Any]:
    """Measure scheduled work across every usable day, including empty days."""
    days = sorted({int(day) for day in eligible_days if 0 <= int(day) <= 6})
    loads = {day: 0 for day in days}
    for session in sessions:
        day = int(session.get("day_index", -1))
        if day in loads:
            loads[day] += max(int(session.get("session_minutes") or 0), 0)
    values = list(loads.values()) or [0]
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return {
        "daily_load_minutes": loads,
        "eligible_day_count": len(days),
        "daily_load_variance": round(variance, 2),
        "daily_peak_minutes": max(values),
    }
