"""Stable learning labels for recommendation feedback episodes."""

from __future__ import annotations


def recommendation_pattern_label(*, reason: object, selected_action: object, accepted: bool) -> str:
    normalized_reason = str(reason or "unknown").strip().lower().replace(" ", "_")
    normalized_action = str(selected_action or "unknown").strip().lower().replace(" ", "_")
    outcome = "accepted" if accepted else "rejected"
    return f"interruption:{normalized_reason}->{normalized_action}:{outcome}"
