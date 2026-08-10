"""Profile aggregate root and its owned state."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProfileAggregate(BaseModel):
    user_id: str = Field(min_length=1)
    role: str
    deep_work_window: str
    low_energy_window: str
    control_preference: str
    timezone: str
    blocker_patterns: list[str] = Field(default_factory=list)
    task_preferences: dict[str, Any] = Field(default_factory=dict)
    weekly_context: dict[str, Any] = Field(default_factory=dict)
    learned_patterns: list[dict[str, Any]] = Field(default_factory=list)
    research_context: dict[str, Any] = Field(default_factory=dict)
    research_context_revision: int = Field(default=0, ge=0)
    active_week_id: str | None = None
    active_plan_revision: int | None = Field(default=None, ge=0)
    last_daily_checkin_date: str | None = None
