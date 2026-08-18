"""Projection of an explicit response to a help-me-decide recommendation."""

from __future__ import annotations

from typing import Any

from app.application.personalization_scope import build_task_evidence_scope
from app.domain.personalization import EvidenceItem


def project_recommendation_feedback(
    *, evidence_id: str, feedback: dict[str, Any], task: dict[str, Any] | None,
) -> EvidenceItem:
    return EvidenceItem(
        evidence_id=evidence_id,
        user_id=str(feedback["user_id"]),
        source_type="execution_feedback",
        source_id=str(feedback["recommendation_id"]),
        origin="explicit_user",
        observed_at=int(feedback["created_at"]),
        claim_key="recommendation_feedback.outcome",
        structured_value={
            "pattern_label": str(feedback["pattern_label"]),
            "reason": str(feedback.get("reason") or "unknown"),
            "accepted": bool(feedback.get("accepted")),
            "recommended_action": str(feedback.get("recommended_action") or "unknown"),
            "selected_action": str(feedback.get("selected_action") or "unknown"),
        },
        scope=build_task_evidence_scope(task),
        user_explicit=True,
        confidence_level="high",
        eligible_for_pattern=True,
    )
