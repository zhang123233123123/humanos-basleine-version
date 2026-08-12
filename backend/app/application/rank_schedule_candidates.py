"""Stable lexicographic ranking for already evaluated schedule candidates."""

from __future__ import annotations

from typing import Any


def candidate_rank_key(candidate: dict[str, Any]) -> tuple[float, ...]:
    """Keep hard feasibility and deadline coverage ahead of human-capacity fit."""
    metrics = dict(candidate.get("metrics") or {})
    validation = dict(candidate.get("validation") or {})
    hard_violations = len(validation.get("violations") or []) if validation.get("valid") is not True else 0
    return (
        float(hard_violations),
        float(metrics.get("remaining_minutes") or 0),
        float(metrics.get("deadline_risk_minutes") or 0),
        float(metrics.get("capacity_penalty") or 0),
        1.0 - float(metrics.get("cognitive_fit_score") or 0),
        float(metrics.get("daily_load_variance") or 0),
        float(metrics.get("context_switch_count") or 0),
        str(candidate.get("id") or ""),
    )


def select_best_candidate(candidates: list[dict[str, Any]], requested_id: str | None = None) -> dict[str, Any] | None:
    """Honor an AI selection only when it belongs to the validated candidate set."""
    if not candidates:
        return None
    requested = next((item for item in candidates if item.get("id") == requested_id), None)
    if requested is not None:
        best_key = min(candidate_rank_key(item) for item in candidates)
        if candidate_rank_key(requested) == best_key:
            return requested
    return min(candidates, key=candidate_rank_key)
