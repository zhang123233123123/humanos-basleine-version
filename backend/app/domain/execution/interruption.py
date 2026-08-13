"""Interruption contract for pausing an Execution Session."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal


InterruptionAction = Literal[
    "short_break",
    "continue_later",
    "switch_task",
    "help_decide",
]

_ACTIONS = frozenset({"short_break", "continue_later", "switch_task", "help_decide"})


@dataclass(frozen=True)
class InterruptionPolicy:
    action: InterruptionAction
    requires_context_dump: bool
    requires_runtime_state: bool
    preserves_session: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def interruption_policy(action: object) -> InterruptionPolicy:
    normalized = str(action or "continue_later").strip().lower()
    if normalized not in _ACTIONS:
        raise ValueError(f"unsupported interruption action: {normalized}")
    return InterruptionPolicy(
        action=normalized,  # type: ignore[arg-type]
        requires_context_dump=normalized in {"continue_later", "switch_task"},
        requires_runtime_state=normalized == "help_decide",
        preserves_session=normalized == "short_break",
    )


def build_interruption_snapshot(
    *,
    task_id: str,
    execution_session_id: str,
    plan_revision: int | None,
    actual_minutes: int,
    remaining_minutes: int,
    action: object,
    reason: str = "",
    progress: str = "",
    next_step: str = "",
) -> dict[str, object]:
    policy = interruption_policy(action)
    return {
        "task_id": task_id,
        "execution_session_id": execution_session_id,
        "plan_revision": plan_revision,
        "actual_minutes": max(int(actual_minutes), 0),
        "remaining_minutes": max(int(remaining_minutes), 0),
        "action": policy.action,
        "reason": str(reason or "").strip(),
        "progress": str(progress or "").strip(),
        "next_step": str(next_step or "").strip(),
        "policy": policy.to_dict(),
    }
