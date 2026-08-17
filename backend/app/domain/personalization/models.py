"""Pure contracts for the user-controlled personalisation learning loop.

These models do not know about SQLite, embeddings, prompts, or scheduling.
Raw events and extracted evidence can support a candidate, but cannot write to
the stable Profile.  A ProfileTrait represents a separate confirmed decision.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .taxonomy import ProfileContextKind, TaskScheduleType

EvidenceSource = Literal[
    "self_report",
    "plan_edit",
    "chat_turn",
    "execution_session",
    "execution_feedback",
    "state_checkin",
    "context_dump",
    "system_observation",
]
EvidenceOrigin = Literal["explicit_user", "observed_behavior", "ai_extraction", "derived_statistic"]
ConfidenceLevel = Literal["low", "medium", "high"]


class EvidenceScope(BaseModel):
    """The context in which an observation may be relevant."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    task_id: str | None = None
    context_item_id: str | None = None
    task_schedule_type: TaskScheduleType | None = None
    profile_context_kind: ProfileContextKind | None = None
    task_domain_type: str | None = None
    resource_modality: list[Literal["visual", "auditory", "verbal", "motor"]] = Field(default_factory=list)
    attention_mode: Literal["continuous", "intermittent", "passive"] | None = None
    temporal_context: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_matching_identity(self) -> "EvidenceScope":
        if self.task_schedule_type and not self.task_id:
            raise ValueError("task_schedule_type requires task_id")
        if self.profile_context_kind and not self.context_item_id:
            raise ValueError("profile_context_kind requires context_item_id")
        return self


class BehaviorEvent(BaseModel):
    """An immutable factual record of something reported or observed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    event_type: str = Field(min_length=1)
    source_type: EvidenceSource
    source_id: str = Field(min_length=1)
    occurred_at: int = Field(ge=1)
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    before: dict[str, Any] = Field(default_factory=dict)
    after: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    profile_write_allowed: Literal[False] = False


class EvidenceItem(BaseModel):
    """A traceable observation that may support or contradict a pattern."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    evidence_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    source_type: EvidenceSource
    source_id: str = Field(min_length=1)
    origin: EvidenceOrigin
    observed_at: int = Field(ge=1)
    claim_key: str = Field(min_length=1)
    structured_value: Any
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    text: str | None = None
    user_explicit: bool = False
    confidence_level: ConfidenceLevel
    eligible_for_pattern: bool = True
    profile_write_allowed: Literal[False] = False
    requires_user_confirmation: Literal[True] = True


class PatternCandidate(BaseModel):
    """A reversible hypothesis assembled from evidence, never a Profile fact."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    candidate_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    trait_key: str = Field(min_length=1)
    proposed_value: Any
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    counter_evidence_ids: list[str] = Field(default_factory=list)
    sample_size: int = Field(ge=0)
    evidence_day_count: int = Field(ge=0)
    confidence_level: ConfidenceLevel
    status: Literal["insufficient_evidence", "candidate", "dismissed", "expired"]
    requires_user_confirmation: Literal[True] = True
    profile_write_allowed: Literal[False] = False

    @model_validator(mode="after")
    def keep_counts_traceable(self) -> "PatternCandidate":
        if self.sample_size < len(self.supporting_evidence_ids) + len(self.counter_evidence_ids):
            raise ValueError("sample_size cannot be smaller than the referenced evidence count")
        if self.evidence_day_count > self.sample_size:
            raise ValueError("evidence_day_count cannot exceed sample_size")
        return self


class ProfileTrait(BaseModel):
    """A structured Profile entry created only after an explicit user decision."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    trait_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    trait_key: str = Field(min_length=1)
    value: Any
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    evidence_ids: list[str] = Field(min_length=1)
    confidence_level: ConfidenceLevel
    status: Literal["confirmed", "superseded", "forgotten"] = "confirmed"
    user_confirmed: Literal[True]
    confirmed_at: int = Field(ge=1)
    updated_at: int = Field(ge=1)
    source_candidate_id: str | None = None

    @model_validator(mode="after")
    def keep_confirmation_chronology(self) -> "ProfileTrait":
        if self.updated_at < self.confirmed_at:
            raise ValueError("updated_at cannot precede confirmed_at")
        return self
