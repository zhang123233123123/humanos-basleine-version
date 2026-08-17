"""Task aggregate root used after parsing and before persistence."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TaskExecutionState(BaseModel):
    model_config = ConfigDict(extra="allow")

    original_estimate_minutes: int = Field(ge=0)
    accumulated_actual_minutes: int = Field(default=0, ge=0)
    remaining_duration_minutes: int = Field(ge=0)
    progress_percent: int = Field(default=0, ge=0, le=100)
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    history_sessions: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def keep_work_accounted_for(self) -> "TaskExecutionState":
        if self.remaining_duration_minutes > self.original_estimate_minutes:
            raise ValueError("remaining work cannot exceed the current estimate")
        return self


class TaskAggregate(BaseModel):
    task_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=160)
    domain_type: str = Field(min_length=1)
    schedule_type: Literal["fixed_event", "flexible_task", "recovery_task"]
    deadline: str | None = None
    duration_minutes: int = Field(ge=1, le=1440)
    priority: Literal["高", "中", "低"]
    status: str = Field(min_length=1)
    context: str = ""
    context_window: dict[str, Any] = Field(default_factory=dict)
    task_demand: dict[str, Any] = Field(default_factory=dict)
    execution: TaskExecutionState
    cognitive_load: str
    ambiguity: str
    switch_cost: str
    reentry_cost: str
    resource_modality: list[str] = Field(default_factory=list)
    attention_mode: Literal["continuous", "intermittent", "passive"] = "continuous"
    parallelizable: bool = False
    expected_difficulty: int | str | None = None
    week_id: str

    @model_validator(mode="after")
    def enforce_schedule_semantics(self) -> "TaskAggregate":
        if self.schedule_type == "fixed_event" and not self.context_window.get("startAt"):
            raise ValueError("fixed_event requires startAt")
        return self
