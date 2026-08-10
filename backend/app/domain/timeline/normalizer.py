"""Pure conversions into the canonical Monday-based weekly axis."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from .models import TimelineInterval


def week_bounds(week_id: str, timezone_name: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone_name)
    monday = datetime.combine(datetime.fromisoformat(week_id).date(), time.min, tzinfo=zone)
    return monday, monday + timedelta(days=7)


def _localized(value: str | datetime, timezone_name: str) -> datetime:
    moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    zone = ZoneInfo(timezone_name)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=zone)
    return moment.astimezone(zone)


def interval_from_datetimes(
    *,
    interval_id: str,
    week_id: str,
    timezone_name: str,
    kind: str,
    start_at: str | datetime,
    end_at: str | datetime,
    source_id: str | None = None,
    task_id: str | None = None,
    status: str = "planned",
    plan_revision: int | None = None,
    movable: bool = False,
    parallelizable: bool = False,
    metadata: dict | None = None,
) -> TimelineInterval:
    week_start, week_end = week_bounds(week_id, timezone_name)
    start = _localized(start_at, timezone_name)
    end = _localized(end_at, timezone_name)
    if start < week_start or end > week_end or end <= start:
        raise ValueError("interval must be a positive range inside the target week")
    if start.date() != (end - timedelta(microseconds=1)).date():
        raise ValueError("timeline intervals must not cross a day boundary")
    day_index = start.weekday()
    start_minute = start.hour * 60 + start.minute
    end_minute = end.hour * 60 + end.minute
    if end.date() > start.date():
        end_minute = 1440
    return TimelineInterval(
        id=interval_id,
        week_id=week_id,
        timezone=timezone_name,
        kind=kind,
        source_id=source_id,
        task_id=task_id,
        day_index=day_index,
        start_minute=start_minute,
        end_minute=end_minute,
        week_start_minute=day_index * 1440 + start_minute,
        week_end_minute=day_index * 1440 + end_minute,
        start_at=start.isoformat(),
        end_at=end.isoformat(),
        status=status,
        plan_revision=plan_revision,
        movable=movable,
        parallelizable=parallelizable,
        metadata=metadata or {},
    )


def interval_from_block(
    block: dict,
    *,
    week_id: str,
    timezone_name: str,
    plan_revision: int | None = None,
) -> TimelineInterval:
    week_start, _ = week_bounds(week_id, timezone_name)
    day_index = int(block.get("day_index", 0))
    start_hour = float(block.get("start", 0))
    end_hour = float(block.get("end", 0))
    start = week_start + timedelta(days=day_index, minutes=round(start_hour * 60))
    end = week_start + timedelta(days=day_index, minutes=round(end_hour * 60))
    kind = str(block.get("kind") or "task_session")
    return interval_from_datetimes(
        interval_id=str(block.get("block_id") or block.get("id") or f"{kind}-{day_index}-{start_hour}"),
        week_id=week_id,
        timezone_name=timezone_name,
        kind=kind,
        start_at=start,
        end_at=end,
        source_id=str(block.get("source_id") or "") or None,
        task_id=str(block.get("task_id") or "") or None,
        status=str(block.get("status") or "planned"),
        plan_revision=plan_revision,
        movable=bool(block.get("movable", kind != "fixed_event")),
        parallelizable=bool(block.get("parallelizable", False)),
        metadata={"legacy_block": block},
    )
