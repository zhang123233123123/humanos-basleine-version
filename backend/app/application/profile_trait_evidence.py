"""Build a user-facing, read-only evidence trace for a ProfileTrait."""

from __future__ import annotations

from typing import Any


PUBLIC_FIELDS = (
    "evidence_id", "source_type", "source_id", "origin", "observed_at",
    "claim_key", "structured_value", "scope", "text", "user_explicit",
    "confidence_level", "eligible_for_pattern", "requires_user_confirmation",
)


def _execution_role(evidence: dict[str, Any]) -> str:
    structured = dict(evidence.get("structured_value") or {})
    context = dict(structured.get("execution_context") or {})
    attribution = str(context.get("attribution") or "unknown")
    if attribution == "parallel" or context.get("actual_parallel") is True:
        return "execution_outcome_parallel"
    if attribution == "independent" or context.get("actual_parallel") is False:
        return "execution_outcome_independent"
    return "execution_outcome_unknown"


def build_profile_trait_evidence_trace(
    trait: dict[str, Any], candidate: dict[str, Any], evidence_items: list[dict[str, Any]],
    *, display_label: str = "", confirmed_at: int | None = None,
) -> dict[str, Any]:
    """Resolve only evidence referenced by, or explicitly linked to, one trait."""
    trait_id = str(trait.get("trait_id") or "")
    supporting_ids = {
        str(item) for item in (candidate.get("supporting_evidence_ids") or trait.get("evidence_ids") or [])
    }
    counter_ids = {str(item) for item in (candidate.get("counter_evidence_ids") or [])}
    evidence_by_id = {str(item.get("evidence_id") or ""): item for item in evidence_items}

    roles: dict[str, str] = {item: "supporting" for item in supporting_ids}
    roles.update({item: "counter" for item in counter_ids})
    for evidence_id, evidence in evidence_by_id.items():
        if evidence.get("claim_key") != "profile_trait.execution_outcome":
            continue
        structured = dict(evidence.get("structured_value") or {})
        if str(structured.get("profile_trait_id") or "") == trait_id:
            roles[evidence_id] = _execution_role(evidence)

    records = []
    for evidence_id, role in roles.items():
        evidence = evidence_by_id.get(evidence_id)
        if not evidence:
            continue
        public = {field: evidence.get(field) for field in PUBLIC_FIELDS if field in evidence}
        public["role"] = role
        public["effective"] = bool(evidence.get("eligible_for_pattern"))
        records.append(public)
    records.sort(key=lambda item: (int(item.get("observed_at") or 0), str(item.get("evidence_id") or "")))

    referenced_ids = supporting_ids | counter_ids
    return {
        "trait": {
            "trait_id": trait_id,
            "trait_key": trait.get("trait_key"),
            "display_label": display_label or trait.get("display_label") or trait.get("trait_key"),
            "value": trait.get("value"),
            "scope": trait.get("scope") or {},
            "status": trait.get("status"),
            "confidence_level": trait.get("confidence_level"),
            "confirmed_at": confirmed_at if confirmed_at is not None else trait.get("confirmed_at"),
            "source_candidate_id": trait.get("source_candidate_id"),
        },
        "evidence": records,
        "summary": {
            "supporting_count": sum(item["role"] == "supporting" for item in records),
            "counter_count": sum(item["role"] == "counter" for item in records),
            "independent_outcome_count": sum(item["role"] == "execution_outcome_independent" for item in records),
            "parallel_outcome_count": sum(item["role"] == "execution_outcome_parallel" for item in records),
            "unknown_outcome_count": sum(item["role"] == "execution_outcome_unknown" for item in records),
            "missing_evidence_ids": sorted(item for item in referenced_ids if item not in evidence_by_id),
        },
    }
