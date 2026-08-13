"""Coordinate AI parsing, deterministic validation, and one corrective retry."""

from __future__ import annotations

from collections.abc import Callable

from ..domain.task.boundary_validator import validate_task_candidates

Parser = Callable[..., list[dict] | None]
EventSink = Callable[[str, dict], None]


def parse_with_validation_retry(
    text: str,
    *,
    expected_count: int,
    current_time: str,
    timezone_name: str,
    chat_context: dict | None,
    parser: Parser | None,
    record_event: EventSink,
) -> list[dict] | None:
    if parser is None:
        return None
    first = parser(
        text,
        current_time=current_time,
        timezone_name=timezone_name,
        chat_context=chat_context,
    )
    first_errors = validate_task_candidates(first, expected_count, text)
    if not first_errors:
        return first
    record_event("task_parse_validation_failed", {
        "attempt": 1, "errors": first_errors, "text": text[:500],
    })
    second = parser(
        text,
        current_time=current_time,
        timezone_name=timezone_name,
        chat_context=chat_context,
        validation_feedback=first_errors,
    )
    second_errors = validate_task_candidates(second, expected_count, text)
    if not second_errors:
        record_event("task_parse_validation_recovered", {
            "attempt": 2, "task_count": len(second or []), "text": text[:500],
        })
        return second
    record_event("task_parse_validation_failed", {
        "attempt": 2, "errors": second_errors, "text": text[:500],
    })
    return None
