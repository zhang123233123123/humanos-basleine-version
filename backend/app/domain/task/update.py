"""Pure update decisions for the Task aggregate."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


SCHEDULING_FIELDS = frozenset({
    "due",
    "start_at",
    "deadline_at",
    "duration",
    "priority",
    "expected_difficulty",
    "cognitive_load",
    "task_demand",
    "dependency",
})

CONTEXT_WINDOW_FIELDS = frozenset({
    "deadline",
    "start_at",
    "deadline_at",
    "estimated_duration",
    "task_type",
    "taskType",
    "dependency",
    "contextWindow",
    "context_window",
})


@dataclass(frozen=True)
class TaskPatchDecision:
    patch: dict[str, Any]
    schedule_changed: bool
    context_window: dict[str, Any] | None
    duration_changed: bool


def decide_task_patch(current: dict[str, Any], incoming: dict[str, Any]) -> TaskPatchDecision:
    patch = dict(incoming)
    if "deadline" in patch and "due" not in patch:
        patch["due"] = patch["deadline"]
    if "estimated_duration" in patch and "duration" not in patch:
        patch["duration"] = patch["estimated_duration"]

    schedule_changed = any(
        key in patch and patch.get(key) != current.get(key)
        for key in SCHEDULING_FIELDS
    )
    context_window = None
    if CONTEXT_WINDOW_FIELDS.intersection(patch):
        current_window = current.get("contextWindow") or {}
        incoming_window = patch.get("contextWindow") or patch.get("context_window") or {}
        if not isinstance(current_window, dict):
            current_window = {}
        if not isinstance(incoming_window, dict):
            incoming_window = {}
        context_window = {**current_window, **incoming_window}
        aliases = {
            "deadline": "deadline",
            "start_at": "startAt",
            "deadline_at": "deadlineAt",
            "estimated_duration": "estimatedDuration",
            "dependency": "dependency",
        }
        for source, target in aliases.items():
            if source in patch:
                context_window[target] = patch.get(source)
        if "task_type" in patch or "taskType" in patch:
            context_window["taskType"] = patch.get("task_type") or patch.get("taskType")

    return TaskPatchDecision(
        patch=patch,
        schedule_changed=schedule_changed,
        context_window=context_window,
        duration_changed="duration" in patch and patch.get("duration") != current.get("duration"),
    )


def status_after_schedule_change(current_status: str, explicit_status: str | None) -> str | None:
    if explicit_status is not None:
        return explicit_status
    if current_status in {"completed", "terminated", "blocked", "paused"}:
        return None
    return "queued"
