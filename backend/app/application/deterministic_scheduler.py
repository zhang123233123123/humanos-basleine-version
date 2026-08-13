"""Profile-driven deterministic scheduling on a canonical weekly axis."""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from humanos_graph import build_scheduling_context, day_index_from_due, parse_due_start_hour, profile_now
from app.domain.timeline import WeeklySegment, WeeklyTimeAxis


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


def _runtime_capacity(runtime_state: dict[str, Any]) -> str:
    focus = int(runtime_state.get("focus") or 4)
    energy = int(runtime_state.get("energy") or 4)
    stress = int(runtime_state.get("stress") or 4)
    if focus <= 3 or energy <= 3 or stress >= 6:
        return "low"
    if focus >= 6 and energy >= 5 and stress <= 5:
        return "high"
    return "normal"


def _demand_level(task: dict[str, Any], analysis: dict[str, Any]) -> str:
    task_id = str(task.get("id") or "")
    inferred = next(
        (
            str(item.get("level") or "").lower()
            for item in analysis.get("task_demands") or []
            if isinstance(item, dict) and str(item.get("task_id") or "") == task_id
        ),
        "",
    )
    if inferred in {"low", "medium", "high"}:
        return inferred
    expected = task.get("expected_difficulty") or (task.get("task_demand") or {}).get("expected_difficulty")
    try:
        score = int(expected)
    except (TypeError, ValueError):
        score = 4
    return "high" if score >= 6 else "low" if score <= 2 else "medium"


def _dependency_order(
    tasks: list[dict[str, Any]],
    analysis: dict[str, Any],
    now: datetime,
    runtime_state: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    task_map = {str(task.get("id")): task for task in tasks}
    predecessors: dict[str, set[str]] = {task_id: set() for task_id in task_map}
    for dependency in analysis.get("dependencies") or []:
        if not isinstance(dependency, dict):
            continue
        before = str(dependency.get("before_task_id") or "")
        after = str(dependency.get("after_task_id") or "")
        if before in task_map and after in task_map:
            predecessors[after].add(before)

    capacity = _runtime_capacity(runtime_state or {})

    def base_key(task: dict[str, Any]) -> tuple[int, int, int, int, str]:
        deadline = _deadline_axis(task, now)
        demand = _demand_level(task, analysis)
        demand_rank = {"low": 0, "medium": 1, "high": 2}.get(demand, 1)
        # Deadline feasibility is protected first. Among tasks that can still
        # meet their deadlines, current state must visibly affect the next
        # session instead of being used only as explanatory metadata.
        state_rank = demand_rank if capacity == "low" else -demand_rank if capacity == "high" else 0
        return (
            deadline if deadline is not None else 10081,
            state_rank,
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
    runtime_state = payload.get("runtime_state") or {}
    adjustment_constraints = payload.get("adjustment_constraints") or {}
    affected_task_ids = {str(item) for item in (payload.get("affected_task_ids") or [])}
    adjustment_trigger = str(payload.get("adjustment_trigger") or "")
    timezone_name = str(profile.get("timezone") or "Asia/Shanghai")
    now = profile_now(profile)
    week_id = str(payload.get("week_id") or profile.get("active_week_id") or (profile.get("weekly_context") or {}).get("week_id") or (now - timedelta(days=now.weekday())).date().isoformat())
    week_start = _week_start(week_id, timezone_name)
    deadline_reference = week_start + timedelta(hours=12)
    planning_current_week = week_start <= now < week_start + timedelta(days=7)
    effective_runtime_state = runtime_state if planning_current_week else {}
    runtime_capacity = _runtime_capacity(effective_runtime_state)
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
        and task.get("status") not in {"completed", "terminated", "blocked"}
        and (
            task.get("status") != "paused"
            or (
                str(task.get("id")) in affected_task_ids
                and adjustment_trigger in {"execution_deferred", "execution_switch", "interruption_replan", "execution_overrun"}
            )
        )
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

    preserve_existing = not payload.get("rebuild_from_scratch")
    current_axis = max(round((now - week_start).total_seconds() / 60 / GRID_MINUTES) * GRID_MINUTES, 0) if week_start <= now < week_start + timedelta(days=7) else 0
    if preserve_existing and existing_plan:
        for raw in existing_plan.get("plan_patch") or []:
            task_id = str(raw.get("task_id") or "")
            if task_id not in active_tasks:
                continue
            # A local interruption replan releases only the affected task's
            # future slots. Other tasks remain stable.
            if task_id in affected_task_ids and adjustment_trigger in {
                "execution_deferred",
                "execution_switch",
                "interruption_replan",
                "execution_overrun",
            }:
                continue
            block = dict(raw)
            try:
                start = _axis(int(block["day_index"]), float(block["start"]))
                end = _axis(int(block["day_index"]), float(block["end"]))
            except (KeyError, TypeError, ValueError):
                continue
            # A daily check-in is allowed to reconsider only today's future
            # work.  Keeping those blocks fixed made the state a stored value
            # with no causal influence on the next-session choice.  Other
            # days, protected time, and work that has already started remain
            # stable.
            if (
                adjustment_trigger == "daily_checkin_changed_capacity"
                and int(block.get("day_index", -1)) == now.weekday()
                and start >= current_axis
            ):
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

    task_not_before: dict[str, int] = {}
    for task_id, value in (adjustment_constraints.get("not_before_by_task") or {}).items():
        if not value:
            continue
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=week_start.tzinfo)
            axis_value = math.ceil((parsed - week_start).total_seconds() / 60 / GRID_MINUTES) * GRID_MINUTES
            task_not_before[str(task_id)] = max(int(axis_value), 0)
        except (TypeError, ValueError):
            continue
    unscheduled: list[dict[str, Any]] = []
    next_session_decision: dict[str, Any] = {}
    first_new_session = True
    for task in _dependency_order(list(active_tasks.values()), analysis, deadline_reference, effective_runtime_state):
        task_id = str(task["id"])
        remaining = _remaining_minutes(task) - allocated[task_id]
        deadline = _deadline_axis(task, deadline_reference)
        dependency_ready = max((task_end.get(item, 0) + rest_minutes for item in dependency_map.get(task_id, set())), default=0)
        task_ready = max(current_axis, dependency_ready, task_not_before.get(task_id, 0))
        session_index = 1 + sum(1 for block in blocks if str(block.get("task_id")) == task_id)
        while remaining > 0:
            state_adjusted = first_new_session and runtime_capacity in {"low", "high"}
            target_session_minutes = min(session_minutes, 30) if state_adjusted and runtime_capacity == "low" else session_minutes
            work = min(target_session_minutes, remaining)
            work = max(math.ceil(work / GRID_MINUTES) * GRID_MINUTES if work > GRID_MINUTES else work, GRID_MINUTES)
            chosen_segment = WeeklyTimeAxis.find_slot(
                available_segments,
                [WeeklySegment(start, end) for start, end in occupied],
                duration_minutes=work,
                not_before=task_ready,
                deadline=deadline,
                rest_after_minutes=rest_minutes,
                grid_minutes=GRID_MINUTES,
            )
            used_buffer = False
            if chosen_segment is None and context.get("keep_buffer"):
                chosen_segment = WeeklyTimeAxis.find_slot(
                    full_available_segments,
                    [WeeklySegment(start, end) for start, end in occupied],
                    duration_minutes=work,
                    not_before=task_ready,
                    deadline=deadline,
                    rest_after_minutes=rest_minutes,
                    grid_minutes=GRID_MINUTES,
                )
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
                    after=task_ready,
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
                    *(
                        [
                            "Today's self-reported capacity shortened only the next session to at most 30 minutes."
                            if runtime_capacity == "low"
                            else "Today's high focus and energy favored a demanding ready task for the next session."
                        ]
                        if state_adjusted
                        else []
                    ),
                    *( ["Protected buffer was used because preferred capacity before the deadline was insufficient."] if used_buffer else [] ),
                ],
                "used_buffer": used_buffer,
                "state_scope": "weekly_skeleton",
                "week_id": week_id,
                "plan_status": "proposed",
                "scheduler": "python_timeline_v2",
            })
            occupied.append((start, min(end + rest_minutes, (start // 1440 + 1) * 1440)))
            task_end[task_id] = end
            allocated[task_id] += actual_work
            remaining -= actual_work
            session_index += 1
            if first_new_session:
                next_session_decision = {
                    "state_used": {
                        "focus": int(effective_runtime_state.get("focus") or 4),
                        "energy": int(effective_runtime_state.get("energy") or 4),
                        "stress": int(effective_runtime_state.get("stress") or 4),
                    },
                    "affected_decision": "next_session_selection",
                    "capacity": runtime_capacity,
                    "first_task_id": task_id,
                    "first_session_minutes": actual_work,
                    "result": (
                        "Started with a shorter checkpoint because current capacity is limited."
                        if runtime_capacity == "low"
                        else "Used current high capacity for the most urgent, important, demanding ready task."
                        if runtime_capacity == "high"
                        else "The current state did not require a next-session override."
                    ),
                }
                first_new_session = False

    blocks.sort(key=lambda item: (_axis(int(item["day_index"]), float(item["start"])), str(item.get("task_id"))))
    return {
        "action": "suggest_plan",
        "plan_patch": blocks,
        "candidate_plans": [{"id": "deterministic", "label": "Profile timeline", "plan_patch": blocks, "unscheduled_tasks": unscheduled}],
        "selected_candidate_id": "deterministic",
        "unscheduled_tasks": unscheduled,
        "ai_task_analysis": analysis,
        "state_decision": next_session_decision,
        "requires_confirmation": True,
        "control_mode": "python_scheduled_user_confirmed",
        "explanation": f"Python allocated {len(blocks)} focus sessions on the weekly timeline using {session_minutes}-minute sessions and {rest_minutes}-minute protected breaks. AI analysis is retained for demand, dependency, and soft-risk review.",
        "confidence": {"level": "high" if not unscheduled else "medium", "evidence": ["Profile", "Weekly Context", "Task deadlines", "Task dependencies", "Python timeline allocation"]},
        "constraint_summary": {**context, "preferred_session_minutes": session_minutes, "rest_minutes": rest_minutes},
        "scheduler": {"engine": "python_timeline_v2", "axis_start": 0, "axis_end": 10080, "grid_minutes": GRID_MINUTES, "session_minutes": session_minutes, "rest_minutes": rest_minutes, "initial_available_minutes": WeeklyTimeAxis.capacity(initial_free_segments), "ai_role": "task_analysis_and_soft_review"},
        "task_ids": sorted(active_tasks),
        "week_id": week_id,
    }
