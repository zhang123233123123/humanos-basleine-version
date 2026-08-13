"""Typed task facts shared by parsers and application services."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ParsedTask(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    schedule_type: Literal["fixed_event", "flexible_task", "recovery_task"] = "flexible_task"
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    start_at: str | None = None
    deadline_at: str | None = None
    priority: Literal["高", "中", "低"] | None = None
    domain_type: Literal["general", "writing", "research", "meeting", "admin", "recovery"] = "general"
    resource_modality: list[Literal["visual", "auditory", "verbal", "manual", "mobility"]] = Field(default_factory=list)
    resource_loads: dict[Literal["visual", "auditory", "verbal", "manual", "mobility", "cognitive"], Literal["none", "low", "medium", "high"]] = Field(default_factory=dict)
    parallelizable: bool = False
    context: str = ""
    missing_fields: list[str] = Field(default_factory=list)
    source_spans: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def enforce_temporal_semantics(self) -> "ParsedTask":
        required_time = "start_at" if self.schedule_type == "fixed_event" else "deadline_at"
        if not getattr(self, required_time) and required_time not in self.missing_fields:
            self.missing_fields.append(required_time)
        if self.duration_minutes is None and "duration_minutes" not in self.missing_fields:
            self.missing_fields.append("duration_minutes")
        return self


class ParsedTaskBatch(BaseModel):
    tasks: list[ParsedTask] = Field(default_factory=list, max_length=20)
