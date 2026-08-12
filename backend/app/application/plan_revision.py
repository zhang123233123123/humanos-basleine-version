"""Application-level commands for plan revision workflows."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from app.domain.planning import PlanRevisionActivation, activate_plan_revision


RESOURCE_PATHS = {
    "profile": "/api/profile",
    "tasks": "/api/tasks",
    "active_plan": "/api/plans/active",
    "execution_sessions": "/api/execution-sessions",
}


def build_replan_request(
    *,
    week_id: str,
    scope: str,
    trigger: str,
    affected_task_ids: list[str] | None,
    request_id: str,
) -> dict[str, Any]:
    """Normalize every replan trigger into one background-job command."""
    normalized_scope = scope if scope in {"local", "full", "today"} else "local"
    task_ids = sorted({str(item).strip() for item in (affected_task_ids or []) if str(item).strip()})
    return {
        "week_id": week_id,
        "source": "mutation_replan",
        "adjustment_trigger": trigger,
        "replan_scope": normalized_scope,
        "affected_task_ids": task_ids,
        "request_id": request_id,
    }


def replan_response(command: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    return {
        "required": True,
        "scope": command["replan_scope"],
        "trigger": command["adjustment_trigger"],
        "affected_task_ids": command["affected_task_ids"],
        "job": job,
        "confirmation_required": True,
        "resources": dict(RESOURCE_PATHS),
    }


def revision_activation(*, week_id: str, revision: int, plan_id: str) -> PlanRevisionActivation:
    return activate_plan_revision(week_id=week_id, revision=revision, plan_id=plan_id)


def activation_event_payload(activation: PlanRevisionActivation) -> dict[str, Any]:
    return {
        "plan_id": activation.plan_id,
        "week_id": activation.week_id,
        "plan_revision": activation.revision,
        "invalidated_resources": list(activation.resource_names),
    }


def activation_resources(activation: PlanRevisionActivation) -> dict[str, str]:
    return {name: RESOURCE_PATHS[name] for name in activation.resource_names}


def activation_debug_view(activation: PlanRevisionActivation) -> dict[str, Any]:
    """Serializable representation for QA tooling without leaking persistence details."""
    return asdict(activation)
