"""Deterministic validation of task boundaries returned by an AI parser."""

from __future__ import annotations

import re

METADATA_ONLY_TITLE = re.compile(
    r"^\s*(?:"
    r"(?:大概|大约|约|预计|需要|持续)*\s*(?:\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(?:个\s*)?(?:分钟|小时|天)|"
    r"(?:deadline|due|截止(?:日期|时间)?|截止|日期|时间|优先级|高优先级|中优先级|低优先级)"
    r")\s*[。.!！]?\s*$",
    re.I,
)


def validate_task_candidates(tasks: list[dict] | None, expected_count: int, source_text: str = "") -> list[str]:
    if not tasks:
        return ["No tasks were returned."]
    errors: list[str] = []
    if len(tasks) != expected_count:
        errors.append(f"Expected {expected_count} independent task(s), but returned {len(tasks)}.")
    for index, task in enumerate(tasks):
        title = str(task.get("title") or "").strip()
        if not title:
            errors.append(f"Task {index + 1} has no title.")
        elif METADATA_ONLY_TITLE.fullmatch(title):
            errors.append(f'Task {index + 1} title "{title}" is metadata, not an executable task.')
        schedule_type = str(task.get("schedule_type") or task.get("task_type") or "flexible_task")
        if schedule_type == "fixed_event" and not task.get("start_at"):
            errors.append(f"Task {index + 1} is fixed_event but has no start_at.")
        if schedule_type != "fixed_event" and task.get("start_at") and not task.get("deadline_at"):
            errors.append(f"Task {index + 1} is flexible work but incorrectly uses start_at instead of deadline_at.")
        spans = [str(span).strip() for span in (task.get("source_spans") or []) if str(span).strip()]
        if not spans:
            errors.append(f"Task {index + 1} has no source_spans grounding its fields in the user input.")
        elif source_text and any(span not in source_text for span in spans):
            errors.append(f"Task {index + 1} contains a source_span that is not an exact quote from the user input.")
        modalities = task.get("resource_modality") or []
        if not modalities:
            errors.append(f"Task {index + 1} has no AI resource_modality classification.")
    return errors
