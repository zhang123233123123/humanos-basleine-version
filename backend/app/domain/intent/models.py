"""Domain values for routing a user message before any side effect occurs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

from pydantic import BaseModel, Field

IntentName = Literal[
    "add_task",
    "reschedule",
    "progress_update",
    "interruption",
    "report_state",
    "other",
]

AIIntentName = Literal[
    "add_task",
    "reschedule",
    "progress_update",
    "interruption",
    "report_state",
    "query_calendar",
    "summarize_schedule",
    "delete_task",
    "update_profile",
    "general_advice",
    "other",
]


class AIIntentResult(BaseModel):
    primary_intent: AIIntentName
    secondary_intents: list[AIIntentName] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    target_task_references: list[str] = Field(default_factory=list)
    requires_clarification: bool = False
    clarification_question: str | None = None
    read_only: bool = False
    reason: str


@dataclass(frozen=True)
class IntentEvidence:
    task_action: bool = False
    future_request: bool = False
    deadline: bool = False
    estimated_duration: bool = False
    completed_progress: bool = False
    reschedule: bool = False
    interruption: bool = False
    state_report: bool = False
    existing_task_reference: bool = False

    def to_dict(self) -> dict[str, bool]:
        return asdict(self)


@dataclass(frozen=True)
class IntentDecision:
    intent: IntentName
    confidence: float
    reason: str
    evidence: IntentEvidence
    model_suggestion: str | None = None
    source: str = "deterministic_fallback"
    requires_clarification: bool = False
    clarification_question: str | None = None
    target_task_references: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "intent": self.intent,
            "confidence": self.confidence,
            "reason": self.reason,
            "evidence": self.evidence.to_dict(),
            "model_suggestion": self.model_suggestion,
            "source": self.source,
            "requires_clarification": self.requires_clarification,
            "clarification_question": self.clarification_question,
            "target_task_references": list(self.target_task_references),
        }
