"""Pure local-rescheduling decision after an execution interruption."""

from __future__ import annotations

from typing import Any


def assess_local_reschedule(
    *,
    impact: dict[str, Any],
    change_minutes: int,
    session_slack_minutes: int = 0,
    idle_gap_minutes: int = 0,
    buffer_minutes: int = 0,
) -> dict[str, Any]:
    """Absorb a delay before requesting a local Calendar Diff.

    This function never moves sessions. It only identifies whether the change
    fits and which future resources a later planner is allowed to release.
    """
    remaining = max(int(change_minutes), 0)
    capacities = [
        ("session_slack", max(int(session_slack_minutes), 0)),
        ("idle_gap", max(int(idle_gap_minutes), 0)),
        ("buffer", max(int(buffer_minutes), 0)),
    ]
    absorbed: list[dict[str, int | str]] = []
    for source, capacity in capacities:
        used = min(remaining, capacity)
        if used:
            absorbed.append({"source": source, "minutes": used})
            remaining -= used

    affected = list(impact.get("affected_sessions") or []) if remaining else []
    reason_codes = list(impact.get("reason_codes") or []) if remaining else []
    insufficient = str(impact.get("capacity_status") or "") == "insufficient"
    calendar_diff_required = remaining > 0 and (bool(affected) or insufficient)
    return {
        "change_minutes": max(int(change_minutes), 0),
        "absorbed": absorbed,
        "unabsorbed_minutes": remaining,
        "absorbed_without_calendar_change": remaining == 0,
        "calendar_diff_required": calendar_diff_required,
        "formal_calendar_changed": False,
        "protected_resources": ["completed_sessions", "running_history", "fixed_events", "unaffected_future_sessions"],
        "releasable_execution_session_ids": [
            str(item.get("execution_session_id"))
            for item in affected
            if item.get("execution_session_id") and not item.get("fixed_event")
        ],
        "reason_codes": reason_codes,
        "confirmation_required": calendar_diff_required,
    }
