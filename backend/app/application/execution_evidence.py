"""Pure adapters from execution records to personalisation contracts."""

from __future__ import annotations

from typing import Any

from app.application.personalization_scope import build_task_evidence_scope
from app.domain.personalization import BehaviorEvent, EvidenceItem


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
    scope = build_task_evidence_scope(task)
    source_id = str(transition["id"])
    occurred_at = int(transition["created_at"])
    session_id = str(action.get("execution_session_id") or "") or None
    eligible = trusted_execution_transition and action_type in {"start", "resume", "pause", "end"}
    source_type = "system_observation" if trusted_execution_transition else "client_reported_transition"
    event = BehaviorEvent(
        event_id=event_id,
        user_id=str(transition["user_id"]),
        event_type=f"execution.{action_type}",
        source_type=source_type,
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
        source_type=source_type,
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
            "profile_trait_refs": list(feedback.get("profile_trait_refs") or []),
        },
        scope=build_task_evidence_scope(task),
        user_explicit=has_report,
        confidence_level="high" if has_report else "low",
        eligible_for_pattern=has_report,
    )


def project_profile_trait_outcomes(
    *, evidence_id_factory: Any, feedback: dict[str, Any], task: dict[str, Any],
) -> list[EvidenceItem]:
    """Link an explicit execution result to traits used by that Session.

    These records are audit/effect evidence only.  They are intentionally not
    eligible for automatic pattern aggregation, preventing a recommendation
    from manufacturing evidence in support of itself.
    """
    task_evaluation = dict(feedback.get("task_evaluation") or {})
    state_evaluation = dict(feedback.get("state_evaluation") or {})
    recommendation_evaluation = dict(feedback.get("recommendation_evaluation") or {})
    explicit = bool(task_evaluation or state_evaluation or recommendation_evaluation)
    result = []
    for trait_id in dict.fromkeys(str(item) for item in feedback.get("profile_trait_refs") or [] if str(item)):
        result.append(EvidenceItem(
            evidence_id=evidence_id_factory(), user_id=str(feedback["user_id"]),
            source_type="execution_feedback", source_id=f"{feedback['id']}:{trait_id}",
            origin="explicit_user", observed_at=int(feedback["created_at"]),
            claim_key="profile_trait.execution_outcome",
            structured_value={
                "profile_trait_id": trait_id,
                "execution_session_id": str(feedback.get("execution_session_id") or "") or None,
                "task_evaluation": task_evaluation, "state_evaluation": state_evaluation,
                "recommendation_evaluation": recommendation_evaluation,
            },
            scope=build_task_evidence_scope(task), user_explicit=explicit,
            confidence_level="high" if explicit else "low", eligible_for_pattern=False,
        ))
    return result
