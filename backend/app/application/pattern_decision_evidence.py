"""Project an explicit rejection of a candidate as durable counter-evidence."""

from __future__ import annotations

from typing import Any

from app.domain.personalization import EvidenceItem, EvidenceScope


def project_pattern_denial(*, evidence_id: str, decision: dict[str, Any]) -> EvidenceItem:
    candidate = dict(decision["candidate"])
    return EvidenceItem(
        evidence_id=evidence_id,
        user_id=str(decision["user_id"]),
        source_type="self_report",
        source_id=str(decision["id"]),
        origin="explicit_user",
        observed_at=int(decision["created_at"]),
        claim_key="pattern_decision.denied",
        structured_value={
            "candidate_id": str(candidate["candidate_id"]),
            "pattern_label": str(candidate["pattern_label"]),
            "trait_key": str(candidate["trait_key"]),
            "proposed_value": candidate["proposed_value"],
        },
        scope=EvidenceScope(**dict(candidate.get("scope") or {})),
        user_explicit=True,
        confidence_level="high",
        eligible_for_pattern=True,
    )
