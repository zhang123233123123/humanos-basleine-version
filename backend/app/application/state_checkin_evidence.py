"""Pure projection from an explicit state check-in to personalisation evidence."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domain.personalization import BehaviorEvent, EvidenceItem, EvidenceScope


REPORTABLE_STATE_FIELDS = (
    "focus",
    "energy",
    "stress",
    "mood",
    "attention_residue",
    "emotion",
    "readiness",
    "daily_note",
)


def _daypart(hour: int) -> str:
    if hour < 6:
        return "night"
    if hour < 12:
        return "morning"
    if hour < 18:
        return "afternoon"
    return "evening"


def project_state_checkin(
    *,
    event_id: str,
    evidence_id: str,
    checkin: dict[str, Any],
) -> tuple[BehaviorEvent, EvidenceItem]:
    submitted = dict(checkin.get("submitted_fields") or {})
    reported = {key: submitted[key] for key in REPORTABLE_STATE_FIELDS if key in submitted}
    reported_fields = tuple(key for key in REPORTABLE_STATE_FIELDS if key in reported)
    missing_fields = tuple(key for key in REPORTABLE_STATE_FIELDS if key not in reported)
    local_time = datetime.fromisoformat(str(checkin["local_time"]))
    timezone_name = str(checkin["timezone"])
    scope = EvidenceScope(temporal_context={
        "timezone": timezone_name,
        "utc_offset": local_time.strftime("%z"),
        "local_date": local_time.date().isoformat(),
        "local_hour": local_time.hour,
        "daypart": _daypart(local_time.hour),
    })
    source_id = str(checkin["id"])
    user_id = str(checkin["user_id"])
    observed_at = int(checkin["created_at"])
    explicit = bool(reported_fields)
    structured_value = {
        "values": reported,
        "reported_fields": list(reported_fields),
        "missing_fields": list(missing_fields),
        "checkin_kind": "daily" if checkin.get("daily_checkin") else "momentary",
        "submission_source": str(checkin.get("submission_source") or "check_in"),
    }
    event = BehaviorEvent(
        event_id=event_id,
        user_id=user_id,
        event_type="state_checkin.submitted",
        source_type="state_checkin",
        source_id=source_id,
        occurred_at=observed_at,
        scope=scope,
        after=reported,
        metadata={
            "reported_fields": list(reported_fields),
            "missing_fields": list(missing_fields),
            "daily_checkin": bool(checkin.get("daily_checkin")),
            "submission_source": str(checkin.get("submission_source") or "check_in"),
        },
    )
    evidence = EvidenceItem(
        evidence_id=evidence_id,
        user_id=user_id,
        source_type="state_checkin",
        source_id=source_id,
        origin="explicit_user",
        observed_at=observed_at,
        claim_key="state_checkin.self_report",
        structured_value=structured_value,
        scope=scope,
        user_explicit=explicit,
        confidence_level="high" if explicit else "low",
        eligible_for_pattern=explicit,
    )
    return event, evidence
