"""Adapt confirmed ProfileTraits into non-binding scheduling hints.

This module deliberately does not know about persistence or mutate a Plan.  It
only translates confirmed, structured traits into auditable preferences that a
scheduler may use after hard feasibility has been established.
"""

from __future__ import annotations

from typing import Any


DAYPART_RANGES = {
    "morning": (6 * 60, 12 * 60),
    "afternoon": (12 * 60, 18 * 60),
    "evening": (18 * 60, 24 * 60),
    "night": (0, 6 * 60),
}


def compile_scheduling_priors(
    traits: list[dict[str, Any]], runtime_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return weak time-of-day hints from explicitly confirmed traits only."""
    runtime_state = runtime_state or {}
    hints: list[dict[str, Any]] = []
    ignored: list[dict[str, str]] = []
    for trait in traits:
        trait_id = str(trait.get("trait_id") or "")
        trait_key = str(trait.get("trait_key") or "")
        if trait.get("status") != "confirmed" or trait.get("user_confirmed") is not True:
            ignored.append({"trait_id": trait_id, "reason": "not_confirmed"})
            continue
        value = trait.get("value") or {}
        if not isinstance(value, dict):
            ignored.append({"trait_id": trait_id, "reason": "unsupported_value"})
            continue
        daypart = str(value.get("daypart") or (trait.get("scope") or {}).get("temporal_context", {}).get("daypart") or "")
        if trait_key not in {"perceived_state.energy", "perceived_state.focus"} or daypart not in DAYPART_RANGES:
            ignored.append({"trait_id": trait_id, "reason": "not_schedule_applicable"})
            continue
        band = str(value.get("band") or "")
        if band not in {"high", "low"}:
            ignored.append({"trait_id": trait_id, "reason": "non_directional"})
            continue
        hints.append({
            "trait_id": trait_id,
            "trait_key": trait_key,
            "daypart": daypart,
            "band": band,
            "minute_range": DAYPART_RANGES[daypart],
            "confidence_level": trait.get("confidence_level") or "medium",
            "evidence_ids": list(trait.get("evidence_ids") or []),
            "authority": "weak_prior",
        })
    current_day_demand = None
    if runtime_state.get("source") == "self_report":
        focus = int(runtime_state.get("focus") or 4)
        energy = int(runtime_state.get("energy") or 4)
        stress = int(runtime_state.get("stress") or 4)
        if focus <= 3 or energy <= 3 or stress >= 6:
            current_day_demand = "low"
        elif focus >= 5 and energy >= 5 and stress <= 5:
            current_day_demand = "high"
    return {
        "hints": hints,
        "ignored": ignored,
        "today_override": runtime_state.get("source") == "self_report",
        "current_day_demand": current_day_demand,
        "authority": "soft_tiebreak_only",
    }


def weak_prior_score(
    *, start_minute: int, task_demand: str, priors: dict[str, Any], today_index: int,
) -> tuple[int, list[str]]:
    """Score a feasible slot; never rejects or moves a slot by itself."""
    day_index = start_minute // 1440
    if priors.get("today_override") and day_index == today_index:
        current_demand = priors.get("current_day_demand")
        return (2 if current_demand and task_demand == current_demand else 0), []
    minute_of_day = start_minute % 1440
    score = 0
    used: list[str] = []
    for hint in priors.get("hints") or []:
        start, end = hint["minute_range"]
        if not start <= minute_of_day < end:
            continue
        desired_band = "high" if task_demand == "high" else "low" if task_demand == "low" else ""
        if desired_band and hint["band"] == desired_band:
            score += 1
            used.append(str(hint["trait_id"]))
    return score, used
