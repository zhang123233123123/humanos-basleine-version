"""Strongly typed output contracts for scheduling language-model calls.

These models validate the model boundary only. Referential integrity,
availability, deadlines, dependencies, and overlap remain authoritative Python
domain checks performed after this structural validation.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ConfidenceLevel = Literal["low", "medium", "high"]
CapacityFit = Literal["ideal", "acceptable", "risky", "unsuitable"]
ParallelRole = Literal["primary", "secondary"]


class StrictOutputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RuntimeStateUsed(StrictOutputModel):
    focus: int | None = Field(default=None, ge=1, le=7)
    energy: int | None = Field(default=None, ge=1, le=7)
    stress: int | None = Field(default=None, ge=1, le=7)


class StateDecisionOutput(StrictOutputModel):
    state_used: RuntimeStateUsed = Field(default_factory=RuntimeStateUsed)
    affected_decision: Literal["next_session_selection"]
    result: str = Field(min_length=1, max_length=500)


class ScheduleBlockOutput(StrictOutputModel):
    task_id: str = Field(min_length=1, max_length=128)
    day_index: int = Field(ge=0, le=6)
    start: float = Field(ge=0, lt=24)
    end: float = Field(gt=0, le=24)
    reason: str = Field(min_length=1, max_length=1000)
    capacity_fit: CapacityFit
    capacity_evidence: list[str] = Field(default_factory=list, max_length=12)
    capacity_tradeoff: str | None = Field(default=None, max_length=1000)
    parallel_group_id: str | None = Field(default=None, max_length=128)
    parallel_role: ParallelRole | None = None

    @field_validator("start", "end")
    @classmethod
    def use_fifteen_minute_grid(cls, value: float) -> float:
        if abs(value * 4 - round(value * 4)) > 0.001:
            raise ValueError("time must be on a 15-minute grid")
        return value

    @model_validator(mode="after")
    def validate_block_relationships(self) -> "ScheduleBlockOutput":
        if self.end <= self.start:
            raise ValueError("end must be later than start")
        if (self.end - self.start) * 60 < 15:
            raise ValueError("a Session must be at least 15 minutes")
        if bool(self.parallel_group_id) != bool(self.parallel_role):
            raise ValueError("parallel_group_id and parallel_role must appear together")
        if self.capacity_fit == "risky" and not self.capacity_tradeoff:
            raise ValueError("risky capacity fit requires capacity_tradeoff")
        return self


class UnallocatedWorkOutput(StrictOutputModel):
    task_id: str = Field(min_length=1, max_length=128)
    remaining_minutes: int = Field(ge=1, le=10080)
    reason: str = Field(min_length=1, max_length=1000)


class ScheduleCandidateOutput(StrictOutputModel):
    id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=200)
    rationale: str = Field(min_length=1, max_length=2000)
    override_reason: str | None = Field(default=None, max_length=1000)
    state_decision: StateDecisionOutput | None = None
    blocks: list[ScheduleBlockOutput] = Field(default_factory=list, max_length=120)
    unallocated: list[UnallocatedWorkOutput] = Field(default_factory=list, max_length=40)


class SchedulePlannerOutput(StrictOutputModel):
    candidate_plans: list[ScheduleCandidateOutput] = Field(min_length=1, max_length=3)
    selected_candidate_id: str = Field(min_length=1, max_length=128)
    evidence: list[str] = Field(default_factory=list, max_length=20)
    confidence_level: ConfidenceLevel
    warnings: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def selected_candidate_must_exist(self) -> "SchedulePlannerOutput":
        candidate_ids = [candidate.id for candidate in self.candidate_plans]
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("candidate ids must be unique")
        if self.selected_candidate_id not in candidate_ids:
            raise ValueError("selected_candidate_id must reference candidate_plans")
        return self


class ScheduleComparisonOutput(StrictOutputModel):
    explanation: str = Field(min_length=1, max_length=2000)
    first_action: str = Field(min_length=1, max_length=1000)
    risk: str = Field(min_length=1, max_length=1000)
    selected_candidate_id: str = Field(min_length=1, max_length=128)
    constraint_interpretation: list[str] = Field(default_factory=list, max_length=20)
    task_demand_review: list[str] = Field(default_factory=list, max_length=40)
    task_dependencies: list[str] = Field(default_factory=list, max_length=40)
    repair_suggestions: list[str] = Field(default_factory=list, max_length=20)
    evidence: list[str] = Field(default_factory=list, max_length=20)
    confidence_level: ConfidenceLevel
    warnings: list[str] = Field(default_factory=list, max_length=20)
