"""Application entry point for typed task parsing."""

from __future__ import annotations

from ..agents.task_parser import PydanticAITaskParser
from ..domain.task.classifier import classify_task
from ..domain.task.validator import validate_enriched_task


def parse_structured_tasks(
    text: str,
    *,
    current_time: str,
    timezone_name: str,
    chat_context: dict | None = None,
    validation_feedback: list[str] | None = None,
) -> list[dict] | None:
    result = PydanticAITaskParser().parse(
        text,
        current_time=current_time,
        timezone_name=timezone_name,
        chat_context=chat_context,
        validation_feedback=validation_feedback,
    )
    if result is None:
        return None
    enriched = []
    for task in result.tasks:
        classification = classify_task(task.title)
        validation = validate_enriched_task(task, classification.domain_type)
        enriched.append({
            **task.model_dump(),
            "domain_type": classification.domain_type,
            "classification_rule": classification.rule_id,
            "classification_validation": validation,
        })
    return enriched
