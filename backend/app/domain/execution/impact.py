"""Pure impact and capacity policy for interrupted or resumed work."""

from __future__ import annotations

from datetime import datetime, timedelta


def _datetime(value: object, timezone) -> datetime | None:
    if not value:
        return None
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.replace(tzinfo=timezone) if result.tzinfo is None else result.astimezone(timezone)
    except (TypeError, ValueError):
        return None


def analyze_remaining_work_impact(
    *,
    current: datetime,
    remaining_minutes: int,
    future_sessions: list[dict],
    current_session_id: str,
    deadline_at: object = None,
    week_end_at: object = None,
    action: str = "resume",
) -> dict:
    remaining = max(int(remaining_minutes), 0)
    estimated_end = current + timedelta(minutes=remaining)
    deadline = _datetime(deadline_at, current.tzinfo)
    week_end = _datetime(week_end_at, current.tzinfo)
    conflicts: list[dict] = []
    for item in future_sessions:
        if str(item.get("execution_session_id") or item.get("id") or "") == current_session_id:
            continue
        planned_start = _datetime(item.get("planned_start_at"), current.tzinfo)
        if planned_start and current <= planned_start < estimated_end:
            conflicts.append({
                "execution_session_id": item.get("execution_session_id") or item.get("id"),
                "task_id": item.get("task_id"),
                "task_title": item.get("task_title") or item.get("title"),
                "planned_start_at": item.get("planned_start_at"),
                "planned_end_at": item.get("planned_end_at"),
                "overlap_minutes": max(int((estimated_end - planned_start).total_seconds() // 60), 1),
            })
    reason_codes: list[str] = []
    if conflicts:
        reason_codes.append("overlaps_future_sessions")
    if deadline and estimated_end > deadline:
        reason_codes.append("insufficient_capacity_before_deadline")
    if week_end and estimated_end > week_end:
        reason_codes.append("insufficient_capacity_in_week")
    insufficient = any(code.startswith("insufficient_capacity") for code in reason_codes)
    options = ["continue_without_changes"] if not reason_codes else [
        "reschedule_affected_sessions",
        "keep_current_plan",
    ]
    if insufficient:
        # Deadline risk has only two user-facing choices. HumanOS never asks
        # the user to move a deadline as an interruption side effect.
        options = ["add_available_time", "keep_current_constraints"]
    elif reason_codes:
        options.insert(0, "schedule_current_remainder_later")
    return {
        "action": action,
        "execution_session_id": current_session_id,
        "evaluated_at": current.isoformat(),
        "remaining_minutes": remaining,
        "estimated_end_at": estimated_end.isoformat(),
        "deadline_at": deadline.isoformat() if deadline else None,
        "week_end_at": week_end.isoformat() if week_end else None,
        "requires_plan_adjustment": bool(reason_codes),
        "capacity_status": "insufficient" if insufficient else "conflict" if conflicts else "fits",
        "reason_codes": reason_codes,
        "affected_sessions": conflicts,
        "options": list(dict.fromkeys(options)),
    }
