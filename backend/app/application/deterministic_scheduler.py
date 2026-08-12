"""Profile-driven deterministic scheduling on a canonical weekly axis."""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from humanos_graph import build_scheduling_context, day_index_from_due, parse_due_start_hour, profile_now


GRID_MINUTES = 15
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _rounded_preference(value: Any, default: int, *, minimum: int = 15, maximum: int = 180) -> int:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        minutes = default
    return min(max(round(minutes / GRID_MINUTES) * GRID_MINUTES, minimum), maximum)


def _active_learned_labels(profile: dict[str, Any]) -> list[str]:
    """Return only preferences that are currently allowed to affect planning."""
    return [
        str(item.get("pattern_label") or "").strip()
        for item in profile.get("learned_patterns") or []
        if isinstance(item, dict)
        and item.get("active", True)
        and (item.get("auto_learned") is True or item.get("user_confirmed") is True)
        and str(item.get("pattern_label") or "").strip()
    ]


def _session_minutes_with_learning(base_minutes: int, labels: list[str]) -> tuple[int, list[str]]:
    """Apply repeated session-length feedback without mutating explicit Profile input."""
    normalized = {label.casefold() for label in labels}
    applied: list[str] = []
    result = base_minutes
    if "prefers shorter focus sessions" in normalized:
        result = max(GRID_MINUTES, base_minutes - GRID_MINUTES)
        applied.append("Prefers shorter focus sessions")
    elif "prefers longer focus sessions" in normalized:
        result = min(180, base_minutes + GRID_MINUTES)
        applied.append("Prefers longer focus sessions")
    if "demanding tasks benefit from smaller steps" in normalized:
        result = min(result, 30)
        applied.append("Demanding tasks benefit from smaller steps")
    return result, applied


def _week_start(week_id: str, timezone_name: str) -> datetime:
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        timezone = ZoneInfo("UTC")
    return datetime.fromisoformat(week_id).replace(tzinfo=timezone)


def _axis(day_index: int, hour: float) -> int:
    return day_index * 1440 + round(hour * 60)


def _hour(axis_minute: int) -> float:
    return (axis_minute % 1440) / 60


def _deadline_axis(task: dict[str, Any], now: datetime) -> int | None:
    day_index = day_index_from_due(task.get("due"), now)
    if day_index is None:
        return None
    deadline_hour = parse_due_start_hour(task.get("due"))
    return _axis(day_index, deadline_hour if deadline_hour is not None else 24.0)


def _remaining_minutes(task: dict[str, Any]) -> int:
    execution = task.get("execution") or {}
    return max(int(execution.get("remaining_duration_minutes", task.get("duration") or 0)), 0)


def _task_kind(task: dict[str, Any]) -> str:
    return str(task.get("type") or task.get("task_type") or "flexible_task")


def _overlaps(start: int, end: int, occupied: list[tuple[int, int]]) -> bool:
    return any(start < occupied_end and occupied_start < end for occupied_start, occupied_end in occupied)


def _dependency_order(tasks: list[dict[str, Any]], analysis: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    task_map = {str(task.get("id")): task for task in tasks}
    predecessors: dict[str, set[str]] = {task_id: set() for task_id in task_map}
    for dependency in analysis.get("dependencies") or []:
        if not isinstance(dependency, dict):
            continue
        before = str(dependency.get("before_task_id") or "")
        after = str(dependency.get("after_task_id") or "")
        if before in task_map and after in task_map:
            predecessors[after].add(before)

    def base_key(task: dict[str, Any]) -> tuple[int, int, int, str]:
        deadline = _deadline_axis(task, now)
        return (
            deadline if deadline is not None else 10081,
            PRIORITY_ORDER.get(str(task.get("priority") or "medium").lower(), 1),
            -_remaining_minutes(task),
            str(task.get("id") or ""),
        )

    ordered: list[dict[str, Any]] = []
    pending = dict(task_map)
    while pending:
        ready = [task for task_id, task in pending.items() if not (predecessors.get(task_id) or set()) & pending.keys()]
        if not ready:
            ready = list(pending.values())
        selected = min(ready, key=base_key)
        ordered.append(selected)
        pending.pop(str(selected.get("id")), None)
    return ordered


def build_deterministic_plan(
    *,
    profile: dict[str, Any],
    tasks: list[dict[str, Any]],
    analysis: dict[str, Any] | None = None,
    existing_plan: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Allocate task sessions without allowing the model to invent times."""
    payload = payload or {}
    analysis = analysis or {}
    timezone_name = str(profile.get("timezone") or "Asia/Shanghai")
    now = profile_now(profile)
    week_id = str(payload.get("week_id") or profile.get("active_week_id") or (profile.get("weekly_context") or {}).get("week_id") or (now - timedelta(days=now.weekday())).date().isoformat())
    week_start = _week_start(week_id, timezone_name)
    preferences = profile.get("task_preferences") or {}
    explicit_session_minutes = _rounded_preference(preferences.get("preferred_session_minutes"), 45)
    learned_pattern_labels = _active_learned_labels(profile)
    session_minutes, directly_applied_patterns = _session_minutes_with_learning(
        explicit_session_minutes,
        learned_pattern_labels,
    )
    rest_minutes = _rounded_preference(preferences.get("rest_between_tasks_minutes"), 15, maximum=60)
    context = build_scheduling_context(profile)
    raw_windows = context.get("movable_routine_windows") or context.get("windows") or []
    windows = sorted(
        (_axis(int(item["day_index"]), float(item["start"])), _axis(int(item["day_index"]), float(item["end"])))
        for item in raw_windows
        if int(item.get("day_index", -1)) in range(7) and float(item.get("end", 0)) > float(item.get("start", 0))
    )
    occupied: list[tuple[int, int]] = sorted(
        (_axis(int(item["day_index"]), float(item["start"])), _axis(int(item["day_index"]), float(item["end"])))
        for item in context.get("hard_constraints") or []
        if int(item.get("day_index", -1)) in range(7) and float(item.get("end", 0)) > float(item.get("start", 0))
    )
    active_tasks = {
        str(task.get("id")): task
        for task in tasks
        if task.get("id")
        and not task.get("removed_from_week")
        and task.get("status") not in {"completed", "terminated", "blocked", "paused"}
        and _task_kind(task) != "fixed_event"
        and _remaining_minutes(task) > 0
    }
    blocks: list[dict[str, Any]] = []
    allocated: dict[str, int] = {task_id: 0 for task_id in active_tasks}
    task_end: dict[str, int] = {}

    preserve_existing = not payload.get("rebuild_from_scratch")
    if preserve_existing and existing_plan:
        for raw in existing_plan.get("plan_patch") or []:
            task_id = str(raw.get("task_id") or "")
            if task_id not in active_tasks:
                continue
            block = dict(raw)
            try:
                start = _axis(int(block["day_index"]), float(block["start"]))
                end = _axis(int(block["day_index"]), float(block["end"]))
            except (KeyError, TypeError, ValueError):
                continue
            if end <= start or _overlaps(start, end + rest_minutes, occupied):
                continue
            work = min(int(block.get("planned_work_minutes") or end - start), _remaining_minutes(active_tasks[task_id]) - allocated[task_id])
            if work <= 0:
                continue
            block.update({"planned_work_minutes": work, "session_minutes": work, "scheduler": "python_timeline_v1"})
            blocks.append(block)
            allocated[task_id] += work
            task_end[task_id] = max(task_end.get(task_id, 0), end)
            occupied.append((start, min(end + rest_minutes, (start // 1440 + 1) * 1440)))

    dependency_map: dict[str, set[str]] = {task_id: set() for task_id in active_tasks}
    for dependency in analysis.get("dependencies") or []:
        if isinstance(dependency, dict):
            before = str(dependency.get("before_task_id") or "")
            after = str(dependency.get("after_task_id") or "")
            if before in active_tasks and after in active_tasks:
                dependency_map[after].add(before)

    current_axis = max(round((now - week_start).total_seconds() / 60 / GRID_MINUTES) * GRID_MINUTES, 0) if week_start <= now < week_start + timedelta(days=7) else 0
    unscheduled: list[dict[str, Any]] = []
    for task in _dependency_order(list(active_tasks.values()), analysis, now):
        task_id = str(task["id"])
        remaining = _remaining_minutes(task) - allocated[task_id]
        deadline = _deadline_axis(task, now)
        dependency_ready = max((task_end.get(item, 0) + rest_minutes for item in dependency_map.get(task_id, set())), default=0)
        session_index = 1 + sum(1 for block in blocks if str(block.get("task_id")) == task_id)
        while remaining > 0:
            work = min(session_minutes, remaining)
            work = max(math.ceil(work / GRID_MINUTES) * GRID_MINUTES if work > GRID_MINUTES else work, GRID_MINUTES)
            chosen: tuple[int, int] | None = None
            for window_start, window_end in windows:
                start = max(window_start, current_axis, dependency_ready)
                start = math.ceil(start / GRID_MINUTES) * GRID_MINUTES
                while start + work <= window_end:
                    end = start + work
                    if deadline is not None and end > deadline:
                        break
                    rest_end = min(end + rest_minutes, (start // 1440 + 1) * 1440)
                    if not _overlaps(start, rest_end, occupied):
                        chosen = (start, end)
                        break
                    start += GRID_MINUTES
                if chosen:
                    break
            if not chosen:
                unscheduled.append({
                    "task_id": task_id,
                    "remaining_minutes": remaining,
                    "reason": "no_available_interval_before_deadline" if deadline is not None else "no_available_interval",
                })
                break
            start, end = chosen
            start_at = week_start + timedelta(minutes=start)
            end_at = week_start + timedelta(minutes=end)
            actual_work = min(work, remaining)
            blocks.append({
                "block_id": f"{task_id}-deterministic-{session_index}",
                "task_id": task_id,
                "day_index": start // 1440,
                "deadline_day_index": deadline // 1440 if deadline is not None else None,
                "start": _hour(start),
                "end": _hour(end),
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "kind": "task_session",
                "mode": "execution",
                "session_index": session_index,
                "session_minutes": actual_work,
                "planned_work_minutes": actual_work,
                "padding_minutes": max(work - actual_work, 0),
                "total_task_minutes": _remaining_minutes(task),
                "remaining_after_block_minutes": remaining - actual_work,
                "constraint_evidence": [
                    f"Profile focus-session length: {session_minutes} minutes",
                    f"Profile protected rest after session: {rest_minutes} minutes",
                    "Allocated by deterministic Python weekly timeline",
                    *[f"Auto-learned preference applied: {label}" for label in directly_applied_patterns],
                ],
                "state_scope": "weekly_skeleton",
                "week_id": week_id,
                "plan_status": "proposed",
                "scheduler": "python_timeline_v1",
            })
            occupied.append((start, min(end + rest_minutes, (start // 1440 + 1) * 1440)))
            task_end[task_id] = end
            allocated[task_id] += actual_work
            remaining -= actual_work
            session_index += 1

    blocks.sort(key=lambda item: (_axis(int(item["day_index"]), float(item["start"])), str(item.get("task_id"))))
    return {
        "action": "suggest_plan",
        "plan_patch": blocks,
        "candidate_plans": [{"id": "deterministic", "label": "Profile timeline", "plan_patch": blocks, "unscheduled_tasks": unscheduled}],
        "selected_candidate_id": "deterministic",
        "unscheduled_tasks": unscheduled,
        "ai_task_analysis": analysis,
        "requires_confirmation": True,
        "control_mode": "python_scheduled_user_confirmed",
        "explanation": f"Python allocated {len(blocks)} focus sessions on the weekly timeline using {session_minutes}-minute sessions and {rest_minutes}-minute protected breaks. AI analysis is retained for demand, dependency, and soft-risk review.",
        "confidence": {"level": "high" if not unscheduled else "medium", "evidence": ["Profile", "Weekly Context", "Task deadlines", "Task dependencies", "Python timeline allocation"]},
        "constraint_summary": {**context, "preferred_session_minutes": session_minutes, "rest_minutes": rest_minutes, "learned_patterns_applied": learned_pattern_labels},
        "scheduler": {"engine": "python_timeline_v1", "grid_minutes": GRID_MINUTES, "session_minutes": session_minutes, "explicit_session_minutes": explicit_session_minutes, "rest_minutes": rest_minutes, "learned_patterns_applied": learned_pattern_labels, "directly_applied_patterns": directly_applied_patterns, "ai_role": "task_analysis_and_soft_review"},
        "task_ids": sorted(active_tasks),
        "week_id": week_id,
    }
