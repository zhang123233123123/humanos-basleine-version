"""Profile-driven deterministic scheduling on a canonical weekly axis."""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from humanos_graph import build_scheduling_context, day_index_from_due, parse_due_start_hour, profile_now
from app.domain.timeline import WeeklySegment, WeeklyTimeAxis
try:
    from app.application.scheduling_traits import weak_prior_score
except ImportError:  # package import via ``backend.app`` in repository-root tests
    from backend.app.application.scheduling_traits import weak_prior_score


GRID_MINUTES = 15
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _rounded_preference(value: Any, default: int, *, minimum: int = 15, maximum: int = 180) -> int:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        minutes = default
    return min(max(round(minutes / GRID_MINUTES) * GRID_MINUTES, minimum), maximum)


def _week_start(week_id: str, timezone_name: str) -> datetime:
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        timezone = ZoneInfo("UTC")
    return datetime.fromisoformat(week_id).replace(tzinfo=timezone)


def _axis(day_index: int, hour: float) -> int:
    return WeeklyTimeAxis.from_legacy_hour(day_index, hour)


def _hour(axis_minute: int) -> float:
    return WeeklyTimeAxis.to_legacy_hour(axis_minute)


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
    candidate = WeeklySegment(start, end)
    return any(candidate.overlaps(WeeklySegment(occupied_start, occupied_end)) for occupied_start, occupied_end in occupied)


def _find_slot(
    available: list[WeeklySegment], occupied: list[WeeklySegment], *, duration_minutes: int,
    not_before: int, deadline: int | None, rest_after_minutes: int, priors: dict[str, Any],
    task_demand: str, today_index: int, daily_load_minutes: dict[int, int] | None = None,
) -> tuple[WeeklySegment | None, list[str]]:
    """Choose a slot on the least-loaded feasible day, then apply weak priors."""
    boundary = 10080 if deadline is None else min(max(deadline, 0), 10080)
    candidates: list[tuple[int, int, WeeklySegment, list[str]]] = []
    day_loads = daily_load_minutes or {}
    free = WeeklyTimeAxis.subtract(available, occupied)
    for segment in free:
        start = math.ceil(max(segment.start, not_before) / GRID_MINUTES) * GRID_MINUTES
        while start + duration_minutes <= min(segment.end, boundary):
            end = start + duration_minutes
            day_end = min((start // 1440 + 1) * 1440, 10080)
            protected = WeeklySegment(start, min(end + rest_after_minutes, day_end))
            if any(item.contains(protected) for item in free):
                score, trait_ids = weak_prior_score(
                    start_minute=start, task_demand=task_demand, priors=priors, today_index=today_index,
                )
                candidates.append((-score, start, WeeklySegment(start, end), trait_ids))
            start += GRID_MINUTES
    if not candidates:
        return None, []
    # Deadlines and availability have already filtered the candidates. Balance
    # work across those feasible days before using a learned rhythm as a weak
    # within-day tiebreak.
    _, _, selected, used = min(
        candidates,
        key=lambda item: (
            day_loads.get(item[1] // 1440, 0),
            item[1] // 1440,
            item[0],
            item[1],
        ),
    )
    return selected, used


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
    scheduling_priors = dict(payload.get("scheduling_priors") or {})
    timezone_name = str(profile.get("timezone") or "Asia/Shanghai")
    now = profile_now(profile)
    week_id = str(payload.get("week_id") or profile.get("active_week_id") or (profile.get("weekly_context") or {}).get("week_id") or (now - timedelta(days=now.weekday())).date().isoformat())
    week_start = _week_start(week_id, timezone_name)
    weekly_axis = WeeklyTimeAxis(week_id, timezone_name)
    preferences = profile.get("task_preferences") or {}
    session_minutes = _rounded_preference(preferences.get("preferred_session_minutes"), 45)
    rest_minutes = _rounded_preference(preferences.get("rest_between_tasks_minutes"), 15, maximum=60)
    context = build_scheduling_context(profile)
    raw_windows = context.get("movable_routine_windows") or context.get("windows") or []
    windows = sorted(
        (_axis(int(item["day_index"]), float(item["start"])), _axis(int(item["day_index"]), float(item["end"])))
        for item in raw_windows
        if int(item.get("day_index", -1)) in range(7) and float(item.get("end", 0)) > float(item.get("start", 0))
    )
    fixed_constraints = [
        dict(item)
        for item in context.get("hard_constraints") or []
        if int(item.get("day_index", -1)) in range(7) and float(item.get("end", 0)) > float(item.get("start", 0))
    ]
    occupied: list[tuple[int, int]] = sorted(
        (_axis(int(item["day_index"]), float(item["start"])), _axis(int(item["day_index"]), float(item["end"])))
        for item in fixed_constraints
    )
    available_segments = [WeeklySegment(start, end) for start, end in windows]
    full_windows = context.get("full_available_windows") or raw_windows
    full_available_segments = [
        WeeklySegment(_axis(int(item["day_index"]), float(item["start"])), _axis(int(item["day_index"]), float(item["end"])))
        for item in full_windows
        if int(item.get("day_index", -1)) in range(7) and float(item.get("end", 0)) > float(item.get("start", 0))
    ]
    occupied_segments = [WeeklySegment(start, end) for start, end in occupied]
    initial_free_segments = WeeklyTimeAxis.subtract(available_segments, occupied_segments)
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
    for index, item in enumerate(fixed_constraints):
        start = _axis(int(item["day_index"]), float(item["start"]))
        end = _axis(int(item["day_index"]), float(item["end"]))
        blocks.append({
            "block_id": str(item.get("id") or item.get("context_id") or f"fixed-event-{index}"),
            "source_id": str(item.get("id") or item.get("context_id") or "") or None,
            "task_id": str(item.get("task_id") or "") or None,
            "title": str(item.get("label") or item.get("title") or "Fixed event"),
            "day_index": int(item["day_index"]),
            "start": float(item["start"]),
            "end": float(item["end"]),
            "start_at": (week_start + timedelta(minutes=start)).isoformat(),
            "end_at": (week_start + timedelta(minutes=end)).isoformat(),
            "week_start_minute": start,
            "week_end_minute": end,
            "kind": "fixed_event",
            "mode": "protected",
            "movable": False,
            "session_minutes": end - start,
            "planned_work_minutes": 0,
            "constraint_evidence": ["User-provided fixed event on the weekly timeline"],
            "state_scope": "weekly_hard_constraint",
            "week_id": week_id,
            "plan_status": "proposed",
            "scheduler": "python_timeline_v2",
        })
    allocated: dict[str, int] = {task_id: 0 for task_id in active_tasks}
    task_end: dict[str, int] = {}
    daily_load_minutes: dict[int, int] = {}

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
            day_index = start // 1440
            daily_load_minutes[day_index] = daily_load_minutes.get(day_index, 0) + work
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
    applied_trait_ids: set[str] = set()
    demand_map = {
        str(item.get("task_id")): str(item.get("level") or "medium")
        for item in analysis.get("task_demands") or [] if isinstance(item, dict)
    }
    for task in _dependency_order(list(active_tasks.values()), analysis, now):
        task_id = str(task["id"])
        remaining = _remaining_minutes(task) - allocated[task_id]
        deadline = _deadline_axis(task, now)
        dependency_ready = max((task_end.get(item, 0) + rest_minutes for item in dependency_map.get(task_id, set())), default=0)
        session_index = 1 + sum(1 for block in blocks if str(block.get("task_id")) == task_id)
        while remaining > 0:
            work = min(session_minutes, remaining)
            work = max(math.ceil(work / GRID_MINUTES) * GRID_MINUTES if work > GRID_MINUTES else work, GRID_MINUTES)
            chosen_segment, used_trait_ids = _find_slot(
                available_segments,
                [WeeklySegment(start, end) for start, end in occupied],
                duration_minutes=work,
                not_before=max(current_axis, dependency_ready),
                deadline=deadline,
                rest_after_minutes=rest_minutes,
                priors=scheduling_priors,
                task_demand=demand_map.get(task_id, "medium"),
                today_index=now.weekday(),
                daily_load_minutes=daily_load_minutes,
            )
            used_buffer = False
            if chosen_segment is None and context.get("keep_buffer"):
                chosen_segment, buffer_trait_ids = _find_slot(
                    full_available_segments,
                    [WeeklySegment(start, end) for start, end in occupied],
                    duration_minutes=work,
                    not_before=max(current_axis, dependency_ready),
                    deadline=deadline,
                    rest_after_minutes=rest_minutes,
                    priors=scheduling_priors,
                    task_demand=demand_map.get(task_id, "medium"),
                    today_index=now.weekday(),
                    daily_load_minutes=daily_load_minutes,
                )
                used_trait_ids = buffer_trait_ids
                used_buffer = chosen_segment is not None
            chosen = (chosen_segment.start, chosen_segment.end) if chosen_segment else None
            if not chosen:
                remaining_free = WeeklyTimeAxis.subtract(
                    available_segments,
                    [WeeklySegment(start, end) for start, end in occupied],
                )
                available_minutes = WeeklyTimeAxis.capacity(
                    remaining_free,
                    before=deadline,
                    after=max(current_axis, dependency_ready),
                )
                unscheduled.append({
                    "task_id": task_id,
                    "remaining_minutes": remaining,
                    "required_minutes": remaining,
                    "available_minutes": available_minutes,
                    "shortage_minutes": max(remaining - available_minutes, 0),
                    "reason": "no_available_interval_before_deadline" if deadline is not None else "no_available_interval",
                })
                break
            start, end = chosen
            applied_trait_ids.update(used_trait_ids)
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
                "week_start_minute": start,
                "week_end_minute": end,
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
                    *( [f"Confirmed profile trait used as a weak tiebreak: {trait_id}" for trait_id in used_trait_ids] ),
                    *( ["Protected buffer was used because preferred capacity before the deadline was insufficient."] if used_buffer else [] ),
                ],
                "applied_profile_trait_ids": sorted(used_trait_ids),
                "used_buffer": used_buffer,
                "state_scope": "weekly_skeleton",
                "week_id": week_id,
                "plan_status": "proposed",
                "scheduler": "python_timeline_v2",
            })
            occupied.append((start, min(end + rest_minutes, (start // 1440 + 1) * 1440)))
            task_end[task_id] = end
            allocated[task_id] += actual_work
            day_index = start // 1440
            daily_load_minutes[day_index] = daily_load_minutes.get(day_index, 0) + actual_work
            remaining -= actual_work
            session_index += 1

    blocks.sort(key=lambda item: (_axis(int(item["day_index"]), float(item["start"])), str(item.get("task_id"))))
    applied_traits = [
        {
            "trait_id": str(hint["trait_id"]),
            "trait_key": str(hint["trait_key"]),
            "daypart": str(hint["daypart"]),
            "band": str(hint["band"]),
            "confidence_level": str(hint.get("confidence_level") or "medium"),
            "evidence_count": len(hint.get("evidence_ids") or []),
            "authority": "weak_prior",
        }
        for hint in scheduling_priors.get("hints") or []
        if str(hint.get("trait_id") or "") in applied_trait_ids
    ]
    return {
        "action": "suggest_plan",
        "plan_patch": blocks,
        "candidate_plans": [{"id": "deterministic", "label": "Profile timeline", "plan_patch": blocks, "unscheduled_tasks": unscheduled}],
        "selected_candidate_id": "deterministic",
        "unscheduled_tasks": unscheduled,
        "ai_task_analysis": analysis,
        "requires_confirmation": True,
        "control_mode": "python_scheduled_user_confirmed",
        "explanation": f"Python allocated {len(blocks)} focus sessions across the least-loaded eligible days using {session_minutes}-minute sessions and {rest_minutes}-minute protected breaks. Confirmed traits were used only as soft tiebreaks after hard constraints and current-day state.",
        "confidence": {"level": "high" if not unscheduled else "medium", "evidence": ["Profile", "Weekly Context", "Task deadlines", "Task dependencies", "Python timeline allocation"]},
        "constraint_summary": {**context, "preferred_session_minutes": session_minutes, "rest_minutes": rest_minutes},
        "scheduler": {"engine": "python_timeline_v2", "axis_start": 0, "axis_end": 10080, "grid_minutes": GRID_MINUTES, "session_minutes": session_minutes, "rest_minutes": rest_minutes, "initial_available_minutes": WeeklyTimeAxis.capacity(initial_free_segments), "ai_role": "task_analysis_and_soft_review"},
        "personalization": {
            "authority": "weak_prior",
            "applied_trait_ids": sorted(applied_trait_ids),
            "applied_traits": applied_traits,
            "available_trait_ids": sorted(str(item.get("trait_id")) for item in scheduling_priors.get("hints") or [] if item.get("trait_id")),
            "today_state_overrode_traits": bool(scheduling_priors.get("today_override")),
        },
        "task_ids": sorted(active_tasks),
        "week_id": week_id,
    }
