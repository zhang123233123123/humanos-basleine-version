"""Projection of executable candidates for an explicit task switch."""

from __future__ import annotations

from typing import Any

from app.domain.planning import rank_ready_sessions


def build_ready_queue(
    sessions: list[dict[str, Any]],
    tasks: dict[str, dict[str, Any]],
    *,
    exclude_task_id: str,
    plan_revision: int | None,
    runtime_state: dict[str, Any] | None = None,
    reference_now: object = None,
) -> list[dict[str, Any]]:
    candidates = []
    for session in sessions:
        task_id = str(session.get("task_id") or "")
        if session.get("status") != "ready" or not task_id or task_id == exclude_task_id:
            continue
        if plan_revision is not None and session.get("plan_revision") != plan_revision:
            continue
        task = tasks.get(task_id) or {}
        dependency = task.get("dependency") or task.get("dependencies") or []
        if isinstance(dependency, dict) and dependency.get("hard_blocked"):
            continue
        candidates.append({
            "execution_session_id": session.get("execution_session_id"),
            "task_id": task_id,
            "task_title": task.get("title") or session.get("task_title") or task_id,
            "planned_start_at": session.get("planned_start_at"),
            "planned_work_minutes": session.get("planned_work_minutes"),
            "remaining_minutes": session.get("session_remaining_minutes"),
            "priority": task.get("priority"),
            "expected_difficulty": task.get("expected_difficulty"),
            "task_demand": task.get("task_demand") or task.get("cognitive_load") or task.get("expected_difficulty"),
            "switch_cost": task.get("switch_cost"),
            "reentry_cost": task.get("reentry_cost"),
        })
    return rank_ready_sessions(candidates, runtime_state, reference_now=reference_now)
