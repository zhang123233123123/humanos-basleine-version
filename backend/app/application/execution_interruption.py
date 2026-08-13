"""Application orchestration for an Execution Session interruption."""

from __future__ import annotations

from typing import Any

try:
    from app.domain.execution import interruption_policy
except ImportError:
    from ..domain.execution import interruption_policy


_NEXT_STAGE = {
    "short_break": "break_timer",
    "continue_later": "capture_context_and_resume_time",
    "switch_task": "capture_context_and_ready_queue",
    "help_decide": "capture_reason_and_runtime_state",
}


def build_interruption_command(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize old and new pause requests into one application command."""
    action = payload.get("interruption_action") or payload.get("action") or "continue_later"
    policy = interruption_policy(action)
    return {
        **payload,
        "interruption_action": policy.action,
        "interruption_policy": policy.to_dict(),
    }


def interruption_response(
    *,
    execution_session: dict[str, Any],
    command: dict[str, Any],
    impact: dict[str, Any] | None,
    reschedule_check: dict[str, Any] | None = None,
) -> dict[str, Any]:
    policy = interruption_policy(command.get("interruption_action"))
    return {
        "execution_session": execution_session,
        "interruption": {
            "action": policy.action,
            "policy": policy.to_dict(),
            "next_stage": _NEXT_STAGE[policy.action],
            "context_required": policy.requires_context_dump,
            "runtime_state_required": policy.requires_runtime_state,
            "formal_calendar_changed": False,
        },
        "pause_review": impact or {
            "action": policy.action,
            "requires_plan_adjustment": False,
            "deferred": policy.action == "short_break",
            "affected_sessions": [],
            "options": ["continue_without_changes"],
        },
        "reschedule_check": reschedule_check or {
            "calendar_diff_required": False,
            "formal_calendar_changed": False,
            "confirmation_required": False,
        },
    }
