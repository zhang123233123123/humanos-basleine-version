"""Pure timeline normalization and overlap validation shared across flows."""

from __future__ import annotations

from typing import Any, Callable


def normalize_timeline_block(raw: dict[str, Any], index: int = 0) -> dict[str, Any]:
    """Normalize a legacy plan block onto a Monday-based minute axis."""
    day = int(raw.get("day_index"))
    start = float(raw.get("start"))
    end = float(raw.get("end"))
    if day < 0 or day > 6:
        raise ValueError("day_index must be between 0 and 6")
    if end <= start:
        raise ValueError("timeline block end must be after start")
    if start < 0 or end > 24:
        raise ValueError("timeline block must stay inside one day")
    start_minute = int(round(start * 60))
    end_minute = int(round(end * 60))
    return {
        **raw,
        "block_id": raw.get("block_id") or raw.get("id") or f"timeline-{index}",
        "day_index": day,
        "start": start,
        "end": end,
        "start_minute": start_minute,
        "end_minute": end_minute,
        "week_start_minute": day * 1440 + start_minute,
        "week_end_minute": day * 1440 + end_minute,
    }


def validate_block_overlaps(
    blocks: list[dict[str, Any]],
    *,
    overlap_allowed: Callable[[dict[str, Any], dict[str, Any]], bool] | None = None,
) -> list[dict[str, Any]]:
    """Return stable overlap/normalization violations for weekly blocks."""
    normalized: list[dict[str, Any]] = []
    violations: list[dict[str, Any]] = []
    for index, raw in enumerate(blocks):
        try:
            normalized.append(normalize_timeline_block(raw, index))
        except (TypeError, ValueError) as error:
            violations.append({
                "type": "timeline_normalization",
                "task_id": raw.get("task_id"),
                "block_id": raw.get("block_id"),
                "detail": str(error),
            })
    ordered = sorted(normalized, key=lambda item: (item["week_start_minute"], item["week_end_minute"]))
    for index, first in enumerate(ordered):
        for second in ordered[index + 1:]:
            if second["week_start_minute"] >= first["week_end_minute"]:
                break
            if overlap_allowed and overlap_allowed(first, second):
                continue
            overlap_start = max(float(first["start"]), float(second["start"]))
            overlap_end = min(float(first["end"]), float(second["end"]))
            violations.append({
                "type": "overlap",
                "block_ids": [first.get("block_id"), second.get("block_id")],
                "task_id": str(first.get("task_id") or ""),
                "conflicting_task_id": str(second.get("task_id") or ""),
                "day_index": int(first["day_index"]),
                "start": overlap_start,
                "end": overlap_end,
            })
    return violations
