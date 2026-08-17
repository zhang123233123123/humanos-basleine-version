"""Pure adapters from execution records to personalisation contracts."""

from __future__ import annotations

from typing import Any

from app.domain.personalization import BehaviorEvent, EvidenceItem, EvidenceScope


def _task_scope(task: dict[str, Any] | None) -> EvidenceScope:
    if not task:
        return EvidenceScope()
    return EvidenceScope(
        task_id=str(task.get("id") or "") or None,
        task_schedule_type=task.get("task_type"),
        task_domain_type=str(task.get("type") or "") or None,
        resource_modality=task.get("resource_modality") or [],
        attention_mode=task.get("attention_mode"),
    )


def project_execution_transition(
    *,
    event_id: str,
    evidence_id: str,
    transition: dict[str, Any],
    task: dict[str, Any] | None,
    trusted_execution_transition: bool = True,
) -> tuple[BehaviorEvent, EvidenceItem]:
    action = dict(transition.get("action") or {})
    action_type = str(action.get("type") or "unknown")
    before = dict(transition.get("before_state") or {})
    after = dict(transition.get("actual_state") or {})
    outcome = dict(transition.get("outcome") or {})
    scope = _task_scope(task)
    source_id = str(transition["id"])
    occurred_at = int(transition["created_at"])
    session_id = str(action.get("execution_session_id") or "") or None
    eligible = trusted_execution_transition and action_type in {"start", "resume", "pause", "end", "submit_feedback"}
    event = BehaviorEvent(
        event_id=event_id,
        user_id=str(transition["user_id"]),
        event_type=f"execution.{action_type}",
        source_type="system_observation",
        source_id=source_id,
        occurred_at=occurred_at,
        scope=scope,
        before=before,
        after=after,
        metadata={
            "execution_session_id": session_id,
            "action_detail": {key: value for key, value in action.items() if key not in {"type", "execution_session_id"}},
            "outcome": outcome,
            "trusted_execution_transition": trusted_execution_transition,
        },
    )
    evidence = EvidenceItem(
        evidence_id=evidence_id,
        user_id=str(transition["user_id"]),
        source_type="system_observation",
        source_id=source_id,
        origin="observed_behavior",
        observed_at=occurred_at,
        claim_key=f"execution_behavior.{action_type}",
        structured_value={
            "before_state": before,
            "after_state": after,
            "action_detail": {key: value for key, value in action.items() if key not in {"type", "execution_session_id"}},
            "outcome": outcome,
            "execution_session_id": session_id,
            "trusted_execution_transition": trusted_execution_transition,
        },
        scope=scope,
        confidence_level="high",
        eligible_for_pattern=eligible,
    )
    return event, evidence


def project_execution_feedback(
    *,
    evidence_id: str,
    feedback: dict[str, Any],
    task: dict[str, Any],
) -> EvidenceItem:
    task_evaluation = dict(feedback.get("task_evaluation") or {})
    state_evaluation = dict(feedback.get("state_evaluation") or {})
    recommendation_evaluation = dict(feedback.get("recommendation_evaluation") or {})
    has_report = bool(task_evaluation or state_evaluation or recommendation_evaluation)
    return EvidenceItem(
        evidence_id=evidence_id,
        user_id=str(feedback["user_id"]),
        source_type="execution_feedback",
        source_id=str(feedback["id"]),
        origin="explicit_user",
        observed_at=int(feedback["created_at"]),
        claim_key="execution_feedback.outcome",
        structured_value={
            "trigger": str(feedback.get("trigger") or ""),
            "task_evaluation": task_evaluation,
            "state_evaluation": state_evaluation,
            "recommendation_evaluation": recommendation_evaluation,
            "execution_session_id": str(feedback.get("execution_session_id") or "") or None,
        },
        scope=_task_scope(task),
        user_explicit=has_report,
        confidence_level="high" if has_report else "low",
        eligible_for_pattern=has_report,
    )
