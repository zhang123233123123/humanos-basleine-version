"""Identity-safe policies for changing existing calendar resources."""

from __future__ import annotations

import re

CHANGE_REQUEST = re.compile(
    r"改成|变成|调整到|移到|挪到|提前到|推迟到|改为|"
    r"\b(?:has\s+moved\s+to|moved\s+to|move(?:d)?\b.*?\bto|has\s+changed\s+to|changed\s+to|change(?:d)?\b.*?\bto|rescheduled\s+to|is\s+now|will\s+be\s+at)\b",
    re.I,
)
ORDINAL_REFERENCE = re.compile(r"第\s*([一二两三四五六七八九\d]+)\s*个?")


def is_explicit_change_request(text: str) -> bool:
    return bool(CHANGE_REQUEST.search(text))


def exact_task_reference_indexes(text: str, tasks: list[dict]) -> list[int]:
    lowered = text.lower()
    return [
        index
        for index, task in enumerate(tasks)
        if str(task.get("title") or "").strip()
        and str(task.get("title") or "").strip().lower() in lowered
    ]


def has_unique_task_identity(text: str, tasks: list[dict]) -> bool:
    return bool(ORDINAL_REFERENCE.search(text)) or len(exact_task_reference_indexes(text, tasks)) == 1


def matching_context_item(text: str, items: list[dict]) -> dict | None:
    lowered = text.lower()
    matches: list[dict] = []
    for item in items:
        title = str(item.get("title") or "").strip()
        if title and title.lower() in lowered:
            matches.append(item)
    return matches[0] if len(matches) == 1 else None
