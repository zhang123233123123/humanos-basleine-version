"""Pure projection of a user-authored re-entry checkpoint into evidence."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.application.personalization_scope import build_task_evidence_scope
from app.domain.personalization import BehaviorEvent, EvidenceItem, EvidenceScope


REPORTABLE_CONTEXT_FIELDS = (
    "progress",
    "progress_percent",
    "task_remaining_minutes",
    "open_questions",
    "next_action",
    "stop_reason",
    "materials",
)


def project_context_dump(
    *,
    event_id: str,
    evidence_id: str,
    context_dump: dict[str, Any],
    task: dict[str, Any] | None,
) -> tuple[BehaviorEvent, EvidenceItem]:
    submitted = dict(context_dump.get("submitted_fields") or {})
    reported = {key: submitted[key] for key in REPORTABLE_CONTEXT_FIELDS if key in submitted}
    reported_fields = tuple(key for key in REPORTABLE_CONTEXT_FIELDS if key in reported)
    missing_fields = tuple(key for key in REPORTABLE_CONTEXT_FIELDS if key not in reported)
    local_time = datetime.fromisoformat(str(context_dump["local_time"]))
    task_scope = build_task_evidence_scope(task)
    scope = EvidenceScope(
        **task_scope.model_dump(exclude={"temporal_context"}),
        temporal_context={
            "timezone": str(context_dump["timezone"]),
            "utc_offset": local_time.strftime("%z"),
            "local_date": local_time.date().isoformat(),
            "local_hour": local_time.hour,
            "checkpoint_type": str(context_dump.get("checkpoint_type") or "human_context"),
        },
    )
    source_id = str(context_dump["id"])
    user_id = str(context_dump["user_id"])
    occurred_at = int(context_dump["created_at"])
    explicit = bool(reported_fields)
    event = BehaviorEvent(
        event_id=event_id,
        user_id=user_id,
        event_type="context_dump.saved",
        source_type="context_dump",
        source_id=source_id,
        occurred_at=occurred_at,
        scope=scope,
        after=reported,
        metadata={
            "execution_session_id": str(context_dump.get("execution_session_id") or "") or None,
            "reported_fields": list(reported_fields),
            "missing_fields": list(missing_fields),
        },
    )
    evidence = EvidenceItem(
        evidence_id=evidence_id,
        user_id=user_id,
        source_type="context_dump",
        source_id=source_id,
        origin="explicit_user",
        observed_at=occurred_at,
        claim_key="context_dump.reentry_checkpoint",
        structured_value={
            "values": reported,
            "reported_fields": list(reported_fields),
            "missing_fields": list(missing_fields),
            "checkpoint_type": str(context_dump.get("checkpoint_type") or "human_context"),
        },
        scope=scope,
        user_explicit=explicit,
        confidence_level="high" if explicit else "low",
        eligible_for_pattern=explicit,
    )
    return event, evidence
