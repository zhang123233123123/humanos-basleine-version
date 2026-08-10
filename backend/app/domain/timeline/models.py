"""Canonical weekly timeline contracts.

Every scheduled calendar object is represented as a half-open interval on one
Monday-based weekly axis. Tasks and deadlines are not timeline intervals until
the scheduler produces an actual start and end.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


TimelineKind = Literal[
    "fixed_event",
    "task_session",
    "rest_buffer",
    "unavailable",
    "flexible_activity",
]


class TimelineInterval(BaseModel):
    id: str
    week_id: str
    timezone: str
    kind: TimelineKind
    source_id: str | None = None
    task_id: str | None = None
    day_index: int = Field(ge=0, le=6)
    start_minute: int = Field(ge=0, le=1439)
    end_minute: int = Field(ge=1, le=1440)
    week_start_minute: int = Field(ge=0, le=10079)
    week_end_minute: int = Field(ge=1, le=10080)
    start_at: str
    end_at: str
    status: str = "planned"
    plan_revision: int | None = None
    movable: bool = False
    parallelizable: bool = False
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_axis_coordinates(self) -> "TimelineInterval":
        if self.end_minute <= self.start_minute:
            raise ValueError("timeline interval end must be after start")
        expected_start = self.day_index * 1440 + self.start_minute
        expected_end = self.day_index * 1440 + self.end_minute
        if self.week_start_minute != expected_start or self.week_end_minute != expected_end:
            raise ValueError("weekly and daily timeline coordinates disagree")
        if self.kind == "task_session" and not self.task_id:
            raise ValueError("task_session requires task_id")
        return self

    @property
    def duration_minutes(self) -> int:
        return self.week_end_minute - self.week_start_minute


class TimelineViolation(BaseModel):
    type: str
    interval_ids: list[str] = Field(default_factory=list)
    task_ids: list[str] = Field(default_factory=list)
    message: str
    hard: bool = True


class WeeklyTimeline(BaseModel):
    week_id: str
    timezone: str
    week_start_at: str
    week_end_at: str
    plan_revision: int | None = None
    intervals: list[TimelineInterval] = Field(default_factory=list)
    violations: list[TimelineViolation] = Field(default_factory=list)

    def ordered_intervals(self) -> list[TimelineInterval]:
        return sorted(self.intervals, key=lambda item: (item.week_start_minute, item.week_end_minute, item.id))
