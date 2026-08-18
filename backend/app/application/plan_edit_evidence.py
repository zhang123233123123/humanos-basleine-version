"""Pure adapters from plan-edit records to personalisation contracts."""

from __future__ import annotations

from typing import Any

from app.application.personalization_scope import build_task_evidence_scope
from app.domain.personalization import BehaviorEvent, EvidenceItem


def project_plan_edit(
    *,
    event_id: str,
    evidence_id: str,
    user_id: str,
    source_event_id: str,
    occurred_at: int,
    event_type: str,
    before: dict[str, Any],
    after: dict[str, Any],
    actor: str,
    interaction_source: str,
    effective: bool,
    edit_episode_id: str,
    block_id: str | None,
    validation_result: dict[str, Any],
    task: dict[str, Any] | None,
) -> tuple[BehaviorEvent, EvidenceItem]:
    scope = build_task_evidence_scope(task)
    event = BehaviorEvent(
        event_id=event_id,
        user_id=user_id,
        event_type=event_type,
        source_type="plan_edit",
        source_id=source_event_id,
        occurred_at=occurred_at,
        scope=scope,
        before=before,
        after=after,
        metadata={
            "actor": actor,
            "interaction_source": interaction_source,
            "edit_episode_id": edit_episode_id,
            "block_id": block_id,
            "effective": effective,
            "validation_result": validation_result,
        },
    )
    evidence = EvidenceItem(
        evidence_id=evidence_id,
        user_id=user_id,
        source_type="plan_edit",
        source_id=source_event_id,
        origin="observed_behavior",
        observed_at=occurred_at,
        claim_key=f"schedule_behavior.{event_type}",
        structured_value={
            "event_type": event_type,
            "before": before,
            "after": after,
            "interaction_source": interaction_source,
        },
        scope=scope,
        user_explicit=False,
        confidence_level="high",
        eligible_for_pattern=effective and actor == "user" and event_type != "undo_edit",
    )
    return event, evidence


def project_plan_rationale(
    *,
    evidence_id: str,
    user_id: str,
    rationale_id: str,
    observed_at: int,
    rationale: dict[str, Any],
    canonical_diff: dict[str, Any],
    task: dict[str, Any] | None,
) -> EvidenceItem:
    raw_response = str(rationale.get("raw_user_response") or "").strip()
    reason_codes = [str(item) for item in (rationale.get("reason_codes") or []) if str(item).strip()]
    answered = str(rationale.get("response_status") or "answered") == "answered"
    return EvidenceItem(
        evidence_id=evidence_id,
        user_id=user_id,
        source_type="self_report",
        source_id=rationale_id,
        origin="explicit_user",
        observed_at=observed_at,
        claim_key="schedule_edit.rationale",
        structured_value={
            "reason_codes": reason_codes,
            "raw_user_response": raw_response,
            "generalizability": str(rationale.get("generalizability") or "not_sure"),
            "diff_summary": canonical_diff.get("summary") or {},
        },
        scope=build_task_evidence_scope(task),
        text=raw_response or None,
        user_explicit=answered and bool(raw_response or reason_codes),
        confidence_level="high" if answered and bool(raw_response or reason_codes) else "low",
        eligible_for_pattern=answered and bool(raw_response or reason_codes),
    )
