"""Build the explicit capacity context supplied to schedule-planning agents."""

from __future__ import annotations

from typing import Any


def build_capacity_context(profile: dict[str, Any], runtime_state: dict[str, Any] | None = None) -> dict[str, Any]:
    """Keep stable Profile capacity separate from today's momentary capacity."""
    preferences = dict(profile.get("task_preferences") or {})
    current_state = dict(runtime_state or {})
    return {
        "role": "soft_candidate_selection_not_hard_feasibility",
        "baseline": {
            "preferred_session_minutes": preferences.get("preferred_session_minutes", 45),
            "rest_between_tasks_minutes": preferences.get("rest_between_tasks_minutes", 15),
            "deep_work_window": profile.get("deep_work_window"),
            "low_energy_window": profile.get("low_energy_window"),
        },
        "current_state": {
            "focus": current_state.get("focus"),
            "energy": current_state.get("energy"),
            "stress": current_state.get("stress"),
            "mood": current_state.get("mood"),
        },
        "fit_levels": ["ideal", "acceptable", "risky", "unsuitable"],
        "rules": [
            "Compare each task_demand with the user's baseline and current capacity without collapsing the evidence into an unexplained score.",
            "Prefer ideal over acceptable, and acceptable over risky, after all hard constraints are satisfied.",
            "Use risky only when deadline pressure makes waiting worse; explain the tradeoff and shorten the session or increase recovery where possible.",
            "Never use unsuitable unless no complete feasible candidate exists; report it as unscheduled instead.",
            "Runtime state changes today's near-term sessions only; it must not rewrite the user's long-term profile.",
        ],
    }
