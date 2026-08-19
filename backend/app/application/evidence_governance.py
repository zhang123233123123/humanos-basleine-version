"""Pure helpers for evidence export and deletion-impact reporting."""

from __future__ import annotations

from typing import Any


def evidence_deletion_impact(
    evidence: dict[str, Any], trait_traces: list[dict[str, Any]],
) -> dict[str, Any]:
    evidence_id = str(evidence.get("evidence_id") or "")
    affected_traits = []
    for trace in trait_traces:
        linked = next((item for item in trace.get("evidence", []) if item.get("evidence_id") == evidence_id), None)
        if not linked:
            continue
        trait = dict(trace.get("trait") or {})
        affected_traits.append({
            "trait_id": trait.get("trait_id"),
            "display_label": trait.get("display_label") or trait.get("trait_key"),
            "status": trait.get("status"),
            "role": linked.get("role"),
        })
    role_counts: dict[str, int] = {}
    for item in affected_traits:
        role = str(item.get("role") or "unknown")
        role_counts[role] = role_counts.get(role, 0) + 1
    return {
        "evidence": evidence,
        "affected_traits": affected_traits,
        "role_counts": role_counts,
        "candidate_patterns_recomputed": bool(evidence.get("eligible_for_pattern")),
        "trait_effects_recomputed": any(str(item.get("role") or "").startswith("execution_outcome_") for item in affected_traits),
        "confirmed_traits_unchanged": True,
        "active_plan_unchanged": True,
        "source_record_deleted": False,
    }


def build_profile_data_export(
    *, generated_at: str, traits: list[dict[str, Any]], trait_traces: list[dict[str, Any]],
    confirmations: list[dict[str, Any]], reviews: list[dict[str, Any]],
) -> dict[str, Any]:
    evidence_by_id = {}
    for trace in trait_traces:
        for evidence in trace.get("evidence", []):
            evidence_by_id[str(evidence.get("evidence_id") or "")] = evidence
    public_traits = [{key: value for key, value in trait.items() if key != "user_id"} for trait in traits]
    return {
        "schema_version": "humanos.profile_data_export.v1",
        "generated_at": generated_at,
        "profile_traits": public_traits,
        "trait_evidence_traces": trait_traces,
        "evidence": list(evidence_by_id.values()),
        "confirmation_history": confirmations,
        "review_history": reviews,
        "metadata": {
            "causal_claim_allowed": False,
            "embedding_included": False,
            "unrelated_operational_data_included": False,
            "deleted_evidence_content_included": False,
        },
    }
