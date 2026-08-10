"""Application entry point for typed task parsing."""

from __future__ import annotations

from ..agents.task_parser import PydanticAITaskParser


def parse_structured_tasks(
    text: str,
    *,
    current_time: str,
    timezone_name: str,
    chat_context: dict | None = None,
) -> list[dict] | None:
    result = PydanticAITaskParser().parse(
        text,
        current_time=current_time,
        timezone_name=timezone_name,
        chat_context=chat_context,
    )
    if result is None:
        return None
    return [task.model_dump() for task in result.tasks]
