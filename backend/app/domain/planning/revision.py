"""Rules for replacing the active weekly plan revision."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlanRevisionActivation:
    week_id: str
    revision: int
    plan_id: str
    superseded_plan_statuses: tuple[str, ...]
    superseded_session_statuses: tuple[str, ...]
    preserved_session_statuses: tuple[str, ...]
    paused_session_outcome: str
    resource_names: tuple[str, ...]


def activate_plan_revision(*, week_id: str, revision: int, plan_id: str) -> PlanRevisionActivation:
    """Describe the atomic state transition when a revision is confirmed.

    Completed and currently running execution history is preserved. Future and
    paused sessions from older revisions are retired so the calendar, task list,
    and focus view all project the same revision.
    """
    if not week_id:
        raise ValueError("week_id is required")
    if revision < 1:
        raise ValueError("plan revision must be positive")
    if not plan_id:
        raise ValueError("plan_id is required")
    return PlanRevisionActivation(
        week_id=week_id,
        revision=revision,
        plan_id=plan_id,
        superseded_plan_statuses=("confirmed", "needs_update", "proposed"),
        superseded_session_statuses=("ready", "paused"),
        preserved_session_statuses=("running", "ended", "completed", "not_started", "superseded"),
        paused_session_outcome="replaced_by_revision",
        resource_names=("profile", "tasks", "active_plan", "execution_sessions"),
    )
