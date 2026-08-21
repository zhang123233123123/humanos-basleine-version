"""Typed contracts for non-planner language-model outputs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Confidence = Literal["low", "medium", "high"]
ResourceTag = Literal["visual", "auditory", "verbal", "motor"]
AttentionMode = Literal["continuous", "intermittent", "passive"]


class StrictAIOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ExplicitStateOutput(StrictAIOutput):
    fatigue: bool | None = None
    stress: bool | None = None
    focus_difficulty: bool | None = None


class BehaviorHypothesisOutput(StrictAIOutput):
    label: str = Field(min_length=1, max_length=160)
    confidence: Literal["low"] = "low"
    persist_to_profile: Literal[False] = False


class BehaviorFeatureOutput(StrictAIOutput):
    intent: Literal["add_task", "reschedule", "progress_update", "interruption", "report_state", "other"]
    blockers: list[str] = Field(default_factory=list, max_length=20)
    explicit_state: ExplicitStateOutput = Field(default_factory=ExplicitStateOutput)
    evidence_span: str | None = Field(default=None, max_length=1000)
    hypotheses: list[BehaviorHypothesisOutput] = Field(default_factory=list, max_length=20)
    needs_follow_up: bool = False


class CalendarAdvisorOutput(StrictAIOutput):
    intent: Literal["calendar_query", "planner_handoff"]
    reply: str = Field(min_length=1, max_length=4000)
    handoff_text: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def handoff_requires_text(self) -> "CalendarAdvisorOutput":
        if self.intent == "planner_handoff" and not self.handoff_text:
            raise ValueError("planner_handoff requires handoff_text")
        if self.intent == "calendar_query" and self.handoff_text:
            raise ValueError("calendar_query must not include handoff_text")
        return self


class HelpDecideOutput(StrictAIOutput):
    action: Literal["short_break", "continue_current", "switch_task", "continue_later"]
    reason: str = Field(min_length=1, max_length=2000)
    break_minutes: int | None = Field(default=None, ge=5, le=30)
    duration_minutes: int | None = Field(default=None, ge=5, le=1440)
    target_execution_session_id: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def action_parameters_match(self) -> "HelpDecideOutput":
        if self.action == "short_break" and self.break_minutes is None:
            raise ValueError("short_break requires break_minutes")
        if self.action == "continue_current" and self.duration_minutes is None:
            raise ValueError("continue_current requires duration_minutes")
        if self.action == "switch_task" and not self.target_execution_session_id:
            raise ValueError("switch_task requires target_execution_session_id")
        return self


class TaskDemandOutput(StrictAIOutput):
    task_id: str = Field(min_length=1, max_length=128)
    level: Literal["low", "medium", "high"]
    evidence: list[str] = Field(default_factory=list, max_length=12)
    confidence_level: Confidence = "low"


class DependencyOutput(StrictAIOutput):
    before_task_id: str = Field(min_length=1, max_length=128)
    after_task_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=1000)
    dependency_type: Literal["hard", "soft", "suggested"]
    source: Literal["explicit_user", "task_structure", "llm_inference"]
    confidence: float = Field(ge=0, le=1)
    confidence_level: Confidence


class TaskResourceProfileOutput(StrictAIOutput):
    task_id: str = Field(min_length=1, max_length=128)
    resource_modality: list[ResourceTag] = Field(default_factory=list, max_length=4)
    attention_mode: AttentionMode = "continuous"
    parallelizable: bool
    evidence: list[str] = Field(default_factory=list, max_length=12)
    confidence_level: Confidence = "low"

    @field_validator("resource_modality", mode="before")
    @classmethod
    def normalize_legacy_manual_tag(cls, value: object) -> object:
        if isinstance(value, list):
            return ["motor" if str(item).strip().lower() == "manual" else item for item in value]
        return value


class TaskAnalysisOutput(StrictAIOutput):
    task_demands: list[TaskDemandOutput] = Field(default_factory=list, max_length=40)
    dependencies: list[DependencyOutput] = Field(default_factory=list, max_length=80)
    task_resource_profiles: list[TaskResourceProfileOutput] = Field(default_factory=list, max_length=40)
    evidence: list[str] = Field(default_factory=list, max_length=30)
    confidence_level: Confidence = "medium"


class ParallelPairOutput(StrictAIOutput):
    primary_task_id: str = Field(min_length=1, max_length=128)
    secondary_task_id: str = Field(min_length=1, max_length=128)
    compatible: bool
    suggested_overlap_minutes: Literal[15, 30, 45]
    resource_basis: list[ResourceTag] = Field(default_factory=list, max_length=4)
    confidence_level: Confidence = "low"
    evidence: list[str] = Field(default_factory=list, max_length=12)
    requires_user_confirmation: Literal[True] = True

    @field_validator("resource_basis", mode="before")
    @classmethod
    def normalize_legacy_manual_tag(cls, value: object) -> object:
        if isinstance(value, list):
            return ["motor" if str(item).strip().lower() == "manual" else item for item in value]
        return value

    @model_validator(mode="after")
    def tasks_must_differ(self) -> "ParallelPairOutput":
        if self.primary_task_id == self.secondary_task_id:
            raise ValueError("parallel tasks must be different")
        return self


class ParallelCompatibilityOutput(StrictAIOutput):
    candidate_pairs: list[ParallelPairOutput] = Field(default_factory=list, max_length=80)


class ScheduleSoftReviewOutput(StrictAIOutput):
    status: Literal["clear", "caution", "high_risk"]
    risks: list[str] = Field(default_factory=list, max_length=20)
    strengths: list[str] = Field(default_factory=list, max_length=20)
    user_message: str = Field(min_length=1, max_length=2000)
