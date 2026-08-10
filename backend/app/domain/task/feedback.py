"""Pure execution-feedback policy for updating a Task aggregate."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TaskFeedbackDecision:
    actual_minutes: int
    completion: str
    task_status: str
    execution: dict[str, Any]
    task_demand: dict[str, Any]


def apply_execution_feedback(
    task: dict[str, Any],
    task_evaluation: dict[str, Any],
    *,
    feedback_id: str,
    feedback_created_at: int,
) -> TaskFeedbackDecision:
    completion = str(task_evaluation.get("completion") or "partial")
    actual_minutes = (
        0
        if completion in {"not_started", "did_not_start"}
        else max(int(task_evaluation.get("actual_minutes") or 0), 0)
    )

    execution = dict(task.get("execution") or {})
    execution["accumulated_actual_minutes"] = (
        int(execution.get("accumulated_actual_minutes") or 0) + actual_minutes
    )
    if completion == "completed":
        remaining = 0
    elif task_evaluation.get("remaining_duration_minutes") is not None:
        remaining = max(int(task_evaluation["remaining_duration_minutes"]), 0)
    else:
        previous = int(execution.get("remaining_duration_minutes") or task.get("duration") or 0)
        remaining = max(previous - actual_minutes, 0)
    execution["remaining_duration_minutes"] = remaining
    execution["last_perceived_difficulty"] = task_evaluation.get("perceived_difficulty")
    sessions = list(execution.get("sessions") or [])
    sessions.append({
        "feedback_id": feedback_id,
        "actual_minutes": actual_minutes,
        "completion": completion,
        "perceived_difficulty": task_evaluation.get("perceived_difficulty"),
    })
    execution["sessions"] = sessions

    demand = dict(task.get("task_demand") or {})
    if task_evaluation.get("perceived_difficulty") is not None:
        calibration_history = list(demand.get("calibration_history") or [])
        calibration_history.append({
            "feedback_id": feedback_id,
            "expected_difficulty": task.get("expected_difficulty"),
            "perceived_difficulty": task_evaluation.get("perceived_difficulty"),
        })
        demand["calibration_history"] = calibration_history
        demand["last_calibrated_at"] = feedback_created_at

    return TaskFeedbackDecision(
        actual_minutes=actual_minutes,
        completion=completion,
        task_status="completed" if completion == "completed" else "queued",
        execution=execution,
        task_demand=demand,
    )
