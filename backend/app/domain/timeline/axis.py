"""Finite Monday-based weekly axis and half-open segment operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from .normalizer import week_bounds

WEEK_MINUTES = 7 * 24 * 60


@dataclass(frozen=True, order=True)
class WeeklySegment:
    start: int
    end: int

    def __post_init__(self) -> None:
        if not 0 <= self.start < self.end <= WEEK_MINUTES:
            raise ValueError("weekly segment must be a positive range inside 0..10080")

    @property
    def duration_minutes(self) -> int:
        return self.end - self.start

    def overlaps(self, other: "WeeklySegment") -> bool:
        return self.start < other.end and other.start < self.end

    def contains(self, other: "WeeklySegment") -> bool:
        return self.start <= other.start and other.end <= self.end


class WeeklyTimeAxis:
    """Map calendar instants to a finite weekly axis and manipulate capacity."""

    def __init__(self, week_id: str, timezone_name: str):
        self.week_id = week_id
        self.timezone_name = timezone_name
        self.week_start, self.week_end = week_bounds(week_id, timezone_name)

    @staticmethod
    def minute(day_index: int, minute_of_day: int) -> int:
        value = day_index * 1440 + minute_of_day
        if day_index not in range(7) or minute_of_day not in range(1441) or value > WEEK_MINUTES:
            raise ValueError("point is outside the weekly axis")
        return value

    @staticmethod
    def from_legacy_hour(day_index: int, hour: float) -> int:
        return WeeklyTimeAxis.minute(day_index, round(hour * 60))

    @staticmethod
    def to_day_minute(axis_minute: int) -> tuple[int, int]:
        if not 0 <= axis_minute <= WEEK_MINUTES:
            raise ValueError("point is outside the weekly axis")
        if axis_minute == WEEK_MINUTES:
            return 6, 1440
        return divmod(axis_minute, 1440)

    @staticmethod
    def to_legacy_hour(axis_minute: int) -> float:
        _, minute_of_day = WeeklyTimeAxis.to_day_minute(axis_minute)
        return minute_of_day / 60

    def from_datetime(self, value: datetime) -> int:
        localized = value if value.tzinfo else value.replace(tzinfo=self.week_start.tzinfo)
        localized = localized.astimezone(self.week_start.tzinfo)
        minute = round((localized - self.week_start).total_seconds() / 60)
        if not 0 <= minute <= WEEK_MINUTES:
            raise ValueError("datetime is outside the weekly axis")
        return minute

    def to_datetime(self, axis_minute: int) -> datetime:
        if not 0 <= axis_minute <= WEEK_MINUTES:
            raise ValueError("point is outside the weekly axis")
        return self.week_start + timedelta(minutes=axis_minute)

    @staticmethod
    def merge(segments: list[WeeklySegment]) -> list[WeeklySegment]:
        ordered = sorted(segments)
        merged: list[WeeklySegment] = []
        for segment in ordered:
            if merged and segment.start <= merged[-1].end:
                merged[-1] = WeeklySegment(merged[-1].start, max(merged[-1].end, segment.end))
            else:
                merged.append(segment)
        return merged

    @staticmethod
    def subtract(available: list[WeeklySegment], occupied: list[WeeklySegment]) -> list[WeeklySegment]:
        remaining = WeeklyTimeAxis.merge(available)
        for blocker in WeeklyTimeAxis.merge(occupied):
            next_remaining: list[WeeklySegment] = []
            for segment in remaining:
                if not segment.overlaps(blocker):
                    next_remaining.append(segment)
                    continue
                if segment.start < blocker.start:
                    next_remaining.append(WeeklySegment(segment.start, blocker.start))
                if blocker.end < segment.end:
                    next_remaining.append(WeeklySegment(blocker.end, segment.end))
            remaining = next_remaining
        return remaining

    @staticmethod
    def capacity(segments: list[WeeklySegment], *, before: int | None = None, after: int = 0) -> int:
        boundary = WEEK_MINUTES if before is None else min(max(before, 0), WEEK_MINUTES)
        return sum(max(min(item.end, boundary) - max(item.start, after), 0) for item in WeeklyTimeAxis.merge(segments))
