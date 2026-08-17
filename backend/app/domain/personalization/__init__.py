"""Contracts for evidence-based, user-controlled personalisation."""

from .models import BehaviorEvent, EvidenceItem, EvidenceScope, PatternCandidate, ProfileTrait
from .taxonomy import (
    PROFILE_CONTEXT_KINDS,
    TASK_SCHEDULE_TYPES,
    ProfileContextKind,
    TaskScheduleType,
    require_profile_context_kind,
    require_task_schedule_type,
)

__all__ = [
    "BehaviorEvent",
    "EvidenceItem",
    "EvidenceScope",
    "PatternCandidate",
    "ProfileTrait",
    "PROFILE_CONTEXT_KINDS",
    "TASK_SCHEDULE_TYPES",
    "ProfileContextKind",
    "TaskScheduleType",
    "require_profile_context_kind",
    "require_task_schedule_type",
]
