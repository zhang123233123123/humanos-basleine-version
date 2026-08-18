"""Pure projection of one chat turn without treating assistant text as user data."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domain.personalization import BehaviorEvent, EvidenceItem, EvidenceScope


def project_chat_turn(
    *,
    event_id: str,
    explicit_evidence_id: str,
    hypothesis_evidence_id: str,
    turn: dict[str, Any],
) -> tuple[BehaviorEvent, list[EvidenceItem]]:
    user_text = str(turn.get("user_text") or "")
    features = dict(turn.get("features") or {})
    local_time = datetime.fromisoformat(str(turn["local_time"]))
    scope = EvidenceScope(temporal_context={
        "timezone": str(turn["timezone"]),
        "utc_offset": local_time.strftime("%z"),
        "local_date": local_time.date().isoformat(),
        "local_hour": local_time.hour,
    })
    source_id = str(turn["id"])
    user_id = str(turn["user_id"])
    occurred_at = int(turn["created_at"])
    provenance = str(features.get("extraction_provenance") or "unknown")
    event = BehaviorEvent(
        event_id=event_id,
        user_id=user_id,
        event_type="chat.user_message",
        source_type="chat_turn",
        source_id=source_id,
        occurred_at=occurred_at,
        scope=scope,
        after={"user_text": user_text, "intent": str(turn.get("intent") or "other")},
        metadata={
            "task_ids": [str(item) for item in (turn.get("task_ids") or []) if str(item)],
            "extraction_provenance": provenance,
        },
    )
    evidence: list[EvidenceItem] = []
    raw_explicit_state = features.get("explicit_state")
    explicit_state = {
        str(key): value
        for key, value in (raw_explicit_state.items() if isinstance(raw_explicit_state, dict) else [])
        if value is not None
    }
    evidence_span = str(features.get("evidence_span") or "").strip()
    span_is_traceable = bool(evidence_span and evidence_span in user_text)
    if explicit_state and span_is_traceable:
        evidence.append(EvidenceItem(
            evidence_id=explicit_evidence_id,
            user_id=user_id,
            source_type="chat_turn",
            source_id=source_id,
            origin="ai_extraction",
            observed_at=occurred_at,
            claim_key="chat.explicit_state",
            structured_value={
                "explicit_state": explicit_state,
                "evidence_span": evidence_span,
                "extraction_provenance": provenance,
            },
            scope=scope,
            text=evidence_span,
            user_explicit=True,
            confidence_level="medium",
            eligible_for_pattern=True,
        ))
    hypotheses = []
    for raw in features.get("hypotheses") or []:
        if not isinstance(raw, dict) or not str(raw.get("label") or "").strip():
            continue
        hypotheses.append({
            "label": str(raw["label"]),
            "confidence": str(raw.get("confidence") or "low"),
            "persist_to_profile": False,
        })
    if hypotheses:
        evidence.append(EvidenceItem(
            evidence_id=hypothesis_evidence_id,
            user_id=user_id,
            source_type="chat_turn",
            source_id=source_id,
            origin="ai_extraction",
            observed_at=occurred_at,
            claim_key="chat.hypotheses",
            structured_value={"hypotheses": hypotheses, "extraction_provenance": provenance},
            scope=scope,
            user_explicit=False,
            confidence_level="low",
            eligible_for_pattern=False,
        ))
    return event, evidence
