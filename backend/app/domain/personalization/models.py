"""Pure contracts for the user-controlled personalisation learning loop.

These models do not know about SQLite, embeddings, prompts, or scheduling.
Raw events and extracted evidence can support a candidate, but cannot write to
the stable Profile.  A ProfileTrait represents a separate confirmed decision.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_serializer, field_validator, model_validator

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
    "client_reported_transition",
]
EvidenceOrigin = Literal["explicit_user", "observed_behavior", "ai_extraction", "derived_statistic"]
ConfidenceLevel = Literal["low", "medium", "high"]
StrictTimestamp = Annotated[int, Field(strict=True, ge=1)]
StrictCount = Annotated[int, Field(strict=True, ge=0)]


def _freeze_json(value: JsonValue) -> JsonValue:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})  # type: ignore[return-value]
    if isinstance(value, list):
        return tuple(_freeze_json(item) for item in value)  # type: ignore[return-value]
    return value


def _thaw_json(value: JsonValue) -> JsonValue:
    if isinstance(value, dict) or isinstance(value, MappingProxyType):
        return {str(key): _thaw_json(item) for key, item in value.items()}  # type: ignore[union-attr]
    if isinstance(value, tuple) or isinstance(value, list):
        return [_thaw_json(item) for item in value]
    return value


class EvidenceScope(BaseModel):
    """The context in which an observation may be relevant."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    task_id: str | None = None
    context_item_id: str | None = None
    task_schedule_type: TaskScheduleType | None = None
    profile_context_kind: ProfileContextKind | None = None
    task_domain_type: str | None = None
    resource_modality: tuple[Literal["visual", "auditory", "verbal", "motor"], ...] = ()
    attention_mode: Literal["continuous", "intermittent", "passive"] | None = None
    temporal_context: dict[str, JsonValue] = Field(default_factory=dict)

    @field_validator("resource_modality")
    @classmethod
    def keep_resource_tags_unique(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("resource_modality cannot contain duplicate tags")
        return value

    @field_validator("temporal_context", mode="after")
    @classmethod
    def freeze_temporal_context(cls, value: dict[str, JsonValue]) -> dict[str, JsonValue]:
        return _freeze_json(value)  # type: ignore[return-value]

    @field_serializer("temporal_context")
    def serialize_temporal_context(self, value: JsonValue) -> JsonValue:
        return _thaw_json(value)

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
    occurred_at: StrictTimestamp
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    before: dict[str, JsonValue] = Field(default_factory=dict)
    after: dict[str, JsonValue] = Field(default_factory=dict)
    metadata: dict[str, JsonValue] = Field(default_factory=dict)
    profile_write_allowed: Literal[False] = False

    @field_validator("before", "after", "metadata", mode="after")
    @classmethod
    def freeze_payload(cls, value: dict[str, JsonValue]) -> dict[str, JsonValue]:
        return _freeze_json(value)  # type: ignore[return-value]

    @field_serializer("before", "after", "metadata")
    def serialize_payload(self, value: JsonValue) -> JsonValue:
        return _thaw_json(value)


class EvidenceItem(BaseModel):
    """A traceable observation that may support or contradict a pattern."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    evidence_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    source_type: EvidenceSource
    source_id: str = Field(min_length=1)
    origin: EvidenceOrigin
    observed_at: StrictTimestamp
    claim_key: str = Field(min_length=1)
    structured_value: JsonValue
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    text: str | None = None
    user_explicit: bool = False
    confidence_level: ConfidenceLevel
    eligible_for_pattern: bool = True
    profile_write_allowed: Literal[False] = False
    requires_user_confirmation: Literal[True] = True

    @field_validator("structured_value", mode="after")
    @classmethod
    def freeze_structured_value(cls, value: JsonValue) -> JsonValue:
        return _freeze_json(value)

    @field_serializer("structured_value")
    def serialize_structured_value(self, value: JsonValue) -> JsonValue:
        return _thaw_json(value)


class PatternCandidate(BaseModel):
    """A reversible hypothesis assembled from evidence, never a Profile fact."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    candidate_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    trait_key: str = Field(min_length=1)
    proposed_value: JsonValue
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    supporting_evidence_ids: tuple[str, ...] = ()
    counter_evidence_ids: tuple[str, ...] = ()
    sample_size: StrictCount
    evidence_day_count: StrictCount
    confidence_level: ConfidenceLevel
    status: Literal["insufficient_evidence", "candidate", "dismissed", "expired"]
    requires_user_confirmation: Literal[True] = True
    profile_write_allowed: Literal[False] = False

    @field_validator("proposed_value", mode="after")
    @classmethod
    def freeze_proposed_value(cls, value: JsonValue) -> JsonValue:
        return _freeze_json(value)

    @field_serializer("proposed_value")
    def serialize_proposed_value(self, value: JsonValue) -> JsonValue:
        return _thaw_json(value)

    @model_validator(mode="after")
    def keep_counts_traceable(self) -> "PatternCandidate":
        support = set(self.supporting_evidence_ids)
        counter = set(self.counter_evidence_ids)
        if len(support) != len(self.supporting_evidence_ids) or len(counter) != len(self.counter_evidence_ids):
            raise ValueError("evidence references cannot contain duplicates")
        if support & counter:
            raise ValueError("evidence cannot both support and contradict the same candidate")
        if self.sample_size != len(support) + len(counter):
            raise ValueError("sample_size must equal the referenced evidence count")
        if self.evidence_day_count > self.sample_size:
            raise ValueError("evidence_day_count cannot exceed sample_size")
        return self


class ProfileTrait(BaseModel):
    """A structured Profile entry created only after an explicit user decision."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    trait_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    trait_key: str = Field(min_length=1)
    value: JsonValue
    scope: EvidenceScope = Field(default_factory=EvidenceScope)
    evidence_ids: tuple[str, ...] = Field(min_length=1)
    confidence_level: ConfidenceLevel
    status: Literal["confirmed", "paused", "superseded", "forgotten"] = "confirmed"
    display_label: str | None = None
    user_confirmed: Literal[True]
    confirmed_at: StrictTimestamp
    updated_at: StrictTimestamp
    source_candidate_id: str | None = None

    @field_validator("value", mode="after")
    @classmethod
    def freeze_value(cls, value: JsonValue) -> JsonValue:
        return _freeze_json(value)

    @field_serializer("value")
    def serialize_value(self, value: JsonValue) -> JsonValue:
        return _thaw_json(value)

    @model_validator(mode="after")
    def keep_confirmation_chronology(self) -> "ProfileTrait":
        if len(self.evidence_ids) != len(set(self.evidence_ids)):
            raise ValueError("evidence_ids cannot contain duplicates")
        if self.updated_at < self.confirmed_at:
            raise ValueError("updated_at cannot precede confirmed_at")
        return self
