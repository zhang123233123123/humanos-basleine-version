"""Descriptive, non-causal summaries of outcomes linked to ProfileTraits."""

from __future__ import annotations

from typing import Any


POSITIVE = {"helpful", "good", "yes", "accepted", "fit", "worked", "positive"}
NEGATIVE = {"unhelpful", "bad", "no", "poor", "did_not_fit", "negative"}


def _timing_rating(recommendation: dict[str, Any]) -> str:
    raw = recommendation.get("timing_fit") or recommendation.get("schedule_fit") or recommendation.get("helpfulness")
    value = str(raw or "").strip().lower()
    if value in POSITIVE:
        return "helpful"
    if value in NEGATIVE:
        return "unhelpful"
    return "unrated"


def summarize_trait_effects(
    traits: list[dict[str, Any]], evidence_items: list[dict[str, Any]], labels: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    labels = labels or {}
    by_trait: dict[str, list[dict[str, Any]]] = {}
    for evidence in evidence_items:
        if evidence.get("claim_key") != "profile_trait.execution_outcome":
            continue
        structured = dict(evidence.get("structured_value") or {})
        trait_id = str(structured.get("profile_trait_id") or "")
        if trait_id:
            by_trait.setdefault(trait_id, []).append(evidence)

    summaries = []
    for trait in traits:
        if trait.get("status") != "confirmed" or trait.get("user_confirmed") is not True:
            continue
        trait_id = str(trait["trait_id"])
        outcomes = by_trait.get(trait_id, [])
        completion = {"completed": 0, "partial": 0, "not_started": 0, "other": 0}
        timing = {"helpful": 0, "unhelpful": 0, "unrated": 0}
        favorable_outcomes = 0
        unfavorable_outcomes = 0
        sessions: set[str] = set()
        evidence_ids = []
        for evidence in outcomes:
            structured = dict(evidence.get("structured_value") or {})
            task_eval = dict(structured.get("task_evaluation") or {})
            result = str(task_eval.get("completion") or "other").strip().lower()
            completion[result if result in completion else "other"] += 1
            rating = _timing_rating(dict(structured.get("recommendation_evaluation") or {}))
            timing[rating] += 1
            favorable = result == "completed" or rating == "helpful"
            unfavorable = result == "not_started" or rating == "unhelpful"
            if favorable and not unfavorable:
                favorable_outcomes += 1
            elif unfavorable and not favorable:
                unfavorable_outcomes += 1
            if structured.get("execution_session_id"):
                sessions.add(str(structured["execution_session_id"]))
            evidence_ids.append(str(evidence["evidence_id"]))
        directional = favorable_outcomes + unfavorable_outcomes
        if len(outcomes) < 3:
            assessment = "insufficient_data"
        elif directional and unfavorable_outcomes >= 2 and unfavorable_outcomes / directional >= 0.6:
            assessment = "possible_mismatch"
        elif directional and favorable_outcomes >= 2 and favorable_outcomes / directional >= 0.6:
            assessment = "initially_consistent"
        else:
            assessment = "mixed"
        summaries.append({
            "trait_id": trait_id, "trait_key": trait.get("trait_key"), "value": trait.get("value"),
            "pattern_label": labels.get(trait_id), "usage_with_feedback_count": len(outcomes),
            "execution_session_count": len(sessions), "completion": completion, "timing_feedback": timing,
            "assessment": assessment, "evidence_ids": evidence_ids,
            "causal_claim_allowed": False, "profile_write_allowed": False,
        })
    return summaries
