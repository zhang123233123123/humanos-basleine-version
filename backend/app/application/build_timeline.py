"""Build the canonical weekly timeline persisted with each plan revision."""

from __future__ import annotations

from typing import Any

from app.domain.timeline import WeeklyTimeline, interval_from_block


def build_weekly_timeline_snapshot(
    *,
    week_id: str,
    timezone_name: str,
    blocks: list[dict[str, Any]],
) -> dict[str, Any]:
    intervals = []
    for index, block in enumerate(blocks):
        task_id = str(block.get("task_id") or "")
        kind = str(block.get("kind") or "task_session")
        intervals.append(
            interval_from_block(
                block,
                week_id=week_id,
                timezone_name=timezone_name,
                interval_id=str(block.get("block_id") or f"{task_id}:{index}"),
                kind=kind,
                parallelizable=bool(
                    block.get("parallel_group_id")
                    and block.get("parallel_user_confirmed")
                ),
            )
        )
    return WeeklyTimeline(
        week_id=week_id,
        timezone=timezone_name,
        intervals=intervals,
    ).model_dump(mode="json")
