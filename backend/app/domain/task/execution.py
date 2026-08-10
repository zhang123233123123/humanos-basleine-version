"""Execution Session state machine owned by the Task aggregate."""

from __future__ import annotations

from typing import Literal


ExecutionStatus = Literal[
    "ready",
    "running",
    "paused",
    "ended",
    "completed",
    "not_started",
    "superseded",
]


_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "ready": frozenset({"running", "paused", "ended", "not_started", "superseded"}),
    "running": frozenset({"paused", "ended", "completed"}),
    "paused": frozenset({"running", "ended", "completed", "not_started", "superseded"}),
    "ended": frozenset({"completed", "not_started"}),
    "completed": frozenset(),
    "not_started": frozenset(),
    "superseded": frozenset(),
}


def require_execution_transition(current: str, target: str) -> None:
    if current == target:
        return
    if target not in _ALLOWED_TRANSITIONS.get(current, frozenset()):
        raise ValueError(f"invalid execution transition: {current} -> {target}")


def feedback_session_status(completion: str) -> ExecutionStatus:
    return "not_started" if completion in {"not_started", "did_not_start"} else "completed"


def task_status_for_execution(session_status: str) -> str:
    return {
        "ready": "scheduled",
        "running": "running",
        "paused": "paused",
        "completed": "completed",
        "not_started": "queued",
    }.get(session_status, "queued")
