"""Persistence projection for a Plan coordination result."""

from __future__ import annotations

from typing import Any

from app.domain.profile import sanitize_weekly_context


def _memory_references(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields = ("memory_id", "source_type", "source_id", "task_id", "score", "created_at")
    return [
        {key: item.get(key) for key in fields if item.get(key) is not None}
        for item in items
        if isinstance(item, dict)
    ]


def project_plan_for_persistence(
    decision: dict[str, Any],
    *,
    profile: dict[str, Any],
) -> dict[str, Any]:
    """Keep coordination data while replacing aggregate copies with references/snapshots."""
    stored = {
        key: value
        for key, value in dict(decision).items()
        if key not in {"profile", "tasks", "memories", "joint_state", "memory_evidence"}
    }

    joint_state = decision.get("joint_state") or {}
    environment = joint_state.get("task_environment_state") or {}
    user_state = joint_state.get("user_state") or {}
    stored["coordination_state"] = {
        "ready_task_ids": list(environment.get("ready_task_ids") or []),
        "blocked_task_ids": list(environment.get("blocked_task_ids") or []),
        "needs_clarification": list(environment.get("needs_clarification") or []),
        "ai_task_analysis": environment.get("ai_task_analysis") or decision.get("ai_task_analysis") or {},
        "momentary_state": user_state.get("momentary_state") or {},
        "capacity_score": user_state.get("capacity_score"),
        "capacity_scope": user_state.get("capacity_scope"),
        "capacity_evidence": list(user_state.get("capacity_evidence") or []),
    }

    preferences = profile.get("task_preferences") or {}
    stored["profile_snapshot"] = {
        "profile_updated_at": profile.get("updated_at"),
        "research_context_revision": int(profile.get("research_context_revision") or 0),
        "active_week_id": profile.get("active_week_id"),
        "timezone": profile.get("timezone") or "Asia/Shanghai",
        "deep_work_window": profile.get("deep_work_window"),
        "low_energy_window": profile.get("low_energy_window"),
        "preferred_session_minutes": preferences.get("preferred_session_minutes"),
        "rest_between_tasks_minutes": preferences.get("rest_between_tasks_minutes"),
        "weekly_context": sanitize_weekly_context(profile.get("weekly_context") or {}),
        "learned_pattern_labels": [
            item.get("pattern_label")
            for item in (profile.get("learned_patterns") or [])
            if isinstance(item, dict) and item.get("user_confirmed") and item.get("pattern_label")
        ],
        "applied_profile_trait_ids": list((decision.get("personalization") or {}).get("applied_trait_ids") or []),
    }

    task_ids = {
        str(block.get("task_id"))
        for block in (decision.get("plan_patch") or [])
        if isinstance(block, dict) and block.get("task_id")
    }
    task_ids.update(
        str(item.get("task_id"))
        for item in (decision.get("unscheduled_tasks") or [])
        if isinstance(item, dict) and item.get("task_id")
    )
    stored["task_ids"] = sorted(task_ids)
    stored["memory_evidence_refs"] = _memory_references(list(decision.get("memory_evidence") or []))
    return stored
