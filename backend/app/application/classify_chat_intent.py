"""AI-first intent classification with deterministic fallback and safety checks."""

from __future__ import annotations

from typing import Callable

from ..domain.intent.classifier import classify_intent, extract_intent_evidence
from ..domain.intent.models import AIIntentResult, IntentDecision

Classifier = Callable[..., AIIntentResult | None]

_ROUTE_MAP = {
    "add_task": "add_task",
    "reschedule": "reschedule",
    "progress_update": "progress_update",
    "interruption": "interruption",
    "report_state": "report_state",
}


def classify_chat_intent(
    text: str,
    *,
    current_time: str,
    timezone_name: str,
    chat_context: dict | None,
    ai_classifier: Classifier | None,
) -> IntentDecision:
    ai_result = ai_classifier(text, current_time=current_time, timezone_name=timezone_name, chat_context=chat_context) if ai_classifier else None
    if ai_result is None:
        return classify_intent(text)

    routed = _ROUTE_MAP.get(ai_result.primary_intent, "other")
    # Python owns safety, not semantic routing. Destructive requests and
    # ambiguous writes cannot proceed as ordinary chat actions.
    requires_clarification = bool(ai_result.requires_clarification or ai_result.primary_intent == "delete_task")
    question = ai_result.clarification_question
    if ai_result.primary_intent == "delete_task" and not question:
        question = "请确认你要删除的任务。"
    return IntentDecision(
        intent=routed,
        confidence=ai_result.confidence,
        reason=ai_result.reason,
        evidence=extract_intent_evidence(text),
        model_suggestion=ai_result.primary_intent,
        source="ai",
        requires_clarification=requires_clarification,
        clarification_question=question,
        target_task_references=tuple(ai_result.target_task_references),
    )
