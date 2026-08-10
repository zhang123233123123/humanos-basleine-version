"""Application service for validating legacy plan blocks as a weekly timeline."""

from __future__ import annotations

from typing import Any

from app.domain.timeline import WeeklyTimeline, interval_from_block, validate_timeline


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
            intervals.append(
                interval_from_block(
                    block,
                    week_id=week_id,
                    timezone_name=timezone_name,
                    interval_id=str(block.get("block_id") or f"{task_id}:{index}"),
                    kind=task_kinds.get(task_id, "task_session"),
                    parallelizable=parallel_confirmed,
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

    timeline = WeeklyTimeline(
        week_id=week_id,
        timezone=timezone_name,
        intervals=intervals,
    )
    return [item.model_dump(mode="json") for item in validate_timeline(
        timeline,
        minimum_rest_minutes=minimum_rest_minutes,
    )]
