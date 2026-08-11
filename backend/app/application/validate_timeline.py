"""Application service for validating legacy plan blocks as a weekly timeline."""

from __future__ import annotations

from typing import Any

from app.domain.timeline import WeeklyTimeline, interval_from_block, validate_timeline, week_bounds


def validate_weekly_plan_timeline(
    *,
    week_id: str,
    timezone_name: str,
    blocks: list[dict[str, Any]],
    task_kinds: dict[str, str],
    minimum_rest_minutes: int = 0,
) -> list[dict[str, Any]]:
    """Normalize plan blocks and return transport-safe domain violations."""
    intervals = []
    violations: list[dict[str, Any]] = []

    for index, block in enumerate(blocks):
        task_id = str(block.get("task_id") or "")
        parallel_confirmed = bool(
            block.get("parallel_group_id") and block.get("parallel_user_confirmed")
        )
        try:
            raw_kind = task_kinds.get(task_id, "task_session")
            timeline_kind = "task_session" if raw_kind in {"flexible_task", "recovery_task"} else raw_kind
            normalized_block = {
                **block,
                "block_id": str(block.get("block_id") or f"{task_id}:{index}"),
                "kind": timeline_kind,
                "parallelizable": parallel_confirmed,
            }
            intervals.append(
                interval_from_block(
                    normalized_block,
                    week_id=week_id,
                    timezone_name=timezone_name,
                )
            )
        except (TypeError, ValueError) as exc:
            violations.append(
                {
                    "type": "timeline_normalization",
                    "task_id": task_id,
                    "block_id": block.get("block_id"),
                    "detail": str(exc),
                }
            )

    if violations:
        return violations

    week_start, week_end = week_bounds(week_id, timezone_name)
    timeline = WeeklyTimeline(
        week_id=week_id,
        timezone=timezone_name,
        week_start_at=week_start.isoformat(),
        week_end_at=week_end.isoformat(),
        intervals=intervals,
    )
    return [item.model_dump(mode="json") for item in validate_timeline(
        timeline,
        rest_between_tasks_minutes=minimum_rest_minutes,
    )]
