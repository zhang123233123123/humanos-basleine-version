"""Validated decision support for an interrupted execution session."""

from __future__ import annotations

from typing import Any


ALLOWED_ACTIONS = {"short_break", "continue_current", "switch_task", "continue_later"}


def fallback_recommendation(context: dict[str, Any]) -> dict[str, Any]:
    state = context.get("runtime_state") or {}
    reason = str(context.get("reason") or "").lower()
    ready_queue = context.get("ready_queue") or []
    if any(token in reason for token in ("blocked", "waiting", "缺材料", "卡住", "等待")) and ready_queue:
        candidate = ready_queue[0]
        return {
            "action": "switch_task",
            "target_execution_session_id": candidate.get("execution_session_id"),
            "target_task_id": candidate.get("task_id"),
            "duration_minutes": min(int(candidate.get("remaining_minutes") or candidate.get("planned_work_minutes") or 30), 45),
            "reason": "The current task is blocked, so switch to a ready task without losing its context.",
        }
    if int(state.get("energy") or 4) <= 3 or int(state.get("focus") or 4) <= 3 or int(state.get("stress") or 4) >= 6:
        return {
            "action": "short_break",
            "break_minutes": 10,
            "reason": "Your current capacity is low; take a short timed break before deciding whether to continue.",
        }
    return {
        "action": "continue_current",
        "duration_minutes": min(max(int(context.get("remaining_minutes") or 25), 5), 25),
        "reason": "Your current state can support one bounded continuation of this task.",
    }


def validate_recommendation(raw: object, context: dict[str, Any]) -> dict[str, Any]:
    candidate = dict(raw) if isinstance(raw, dict) else fallback_recommendation(context)
    action = str(candidate.get("action") or "").strip()
    if action not in ALLOWED_ACTIONS:
        candidate = fallback_recommendation(context)
        action = candidate["action"]

    remaining = max(int(context.get("remaining_minutes") or 0), 0)
    ready_queue = context.get("ready_queue") or []
    ready_by_session = {str(item.get("execution_session_id") or ""): item for item in ready_queue}
    violations: list[str] = []

    if action == "short_break":
        minutes = int(candidate.get("break_minutes") or 10)
        if minutes < 5 or minutes > 30:
            violations.append("invalid_break_duration")
            minutes = 10
        candidate["break_minutes"] = minutes
    elif action == "switch_task":
        target_id = str(candidate.get("target_execution_session_id") or "")
        if target_id not in ready_by_session:
            violations.append("target_not_in_ready_queue")
            candidate = fallback_recommendation({**context, "reason": "", "ready_queue": []})
            action = candidate["action"]
        else:
            target = ready_by_session[target_id]
            candidate["target_task_id"] = target.get("task_id")
            candidate["target_task_title"] = target.get("task_title")
    elif action == "continue_current":
        candidate["duration_minutes"] = min(max(int(candidate.get("duration_minutes") or 25), 5), max(remaining, 5))

    candidate["action"] = action
    candidate["validated"] = True
    candidate["validation"] = {
        "valid": not violations,
        "violations": violations,
        "checked_by": "python_help_decide_policy",
    }
    return candidate


def recommendation_prompt(context: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are the HumanOS execution scheduler. Recommend exactly one immediate action. "
                "Return JSON only with action, reason, and the action parameters. Allowed actions: "
                "short_break (break_minutes 5-30), continue_current (duration_minutes), "
                "switch_task (target_execution_session_id), continue_later. Consider the interruption "
                "reason, current focus/energy/stress, elapsed and remaining work, deadline, ready queue, "
                "fixed events, buffer and downstream impact. Never invent task or session identifiers."
            ),
        },
        {"role": "user", "content": str(context)},
    ]
