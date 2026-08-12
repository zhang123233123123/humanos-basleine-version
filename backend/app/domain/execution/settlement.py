"""Pure interruption accounting for one Execution Session."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class ExecutionSettlement:
    previous_active_minutes: int
    elapsed_segment_minutes: int
    effective_active_minutes: int
    session_remaining_minutes: int
    task_remaining_minutes: int

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


def settle_interruption(
    *,
    planned_session_minutes: int,
    previous_active_minutes: int,
    elapsed_segment_minutes: int,
    reported_active_minutes: int | None,
    previous_task_remaining_minutes: int,
) -> ExecutionSettlement:
    previous_active = max(int(previous_active_minutes), 0)
    elapsed = max(int(elapsed_segment_minutes), 0)
    measured_total = previous_active + elapsed
    reported_total = max(int(reported_active_minutes or 0), 0)
    effective_total = max(measured_total, reported_total)
    newly_completed = max(effective_total - previous_active, 0)
    return ExecutionSettlement(
        previous_active_minutes=previous_active,
        elapsed_segment_minutes=elapsed,
        effective_active_minutes=effective_total,
        session_remaining_minutes=max(int(planned_session_minutes) - effective_total, 0),
        task_remaining_minutes=max(int(previous_task_remaining_minutes) - newly_completed, 0),
    )
