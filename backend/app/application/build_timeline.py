"""Build the canonical weekly timeline persisted with each plan revision."""

from __future__ import annotations

from typing import Any

from app.domain.timeline import WeeklyTimeline, interval_from_block, week_bounds


def build_weekly_timeline_snapshot(
    *,
    week_id: str,
    timezone_name: str,
    blocks: list[dict[str, Any]],
) -> dict[str, Any]:
    intervals = []
    for index, block in enumerate(blocks):
        task_id = str(block.get("task_id") or "")
        raw_kind = str(block.get("kind") or "task_session")
        kind = "task_session" if raw_kind in {"flexible_task", "recovery_task"} else raw_kind
        normalized_block = {
            **block,
            "block_id": str(block.get("block_id") or f"{task_id}:{index}"),
            "kind": kind,
            "parallelizable": bool(
                block.get("parallel_group_id")
                and block.get("parallel_user_confirmed")
            ),
        }
        intervals.append(
            interval_from_block(
                normalized_block,
                week_id=week_id,
                timezone_name=timezone_name,
            )
        )
    week_start, week_end = week_bounds(week_id, timezone_name)
    return WeeklyTimeline(
        week_id=week_id,
        timezone=timezone_name,
        week_start_at=week_start.isoformat(),
        week_end_at=week_end.isoformat(),
        intervals=intervals,
    ).model_dump(mode="json")
