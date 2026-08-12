"""Translate parser output into stable Task command and preview payloads."""

from __future__ import annotations

from collections.abc import Callable

DurationNormalizer = Callable[[object], int]


def normalize_parser_items(
    raw_tasks: list[dict],
    *,
    source_text: str,
    timezone_name: str,
    parser_name: str,
    inferred_single_duration: int | None,
    normalize_duration: DurationNormalizer,
) -> list[dict]:
    payloads: list[dict] = []
    for item in raw_tasks[:8]:
        if not isinstance(item, dict):
            continue
        duration_value = item.get("duration_minutes")
        if duration_value is None:
            duration_value = item.get("estimated_duration") or item.get("duration") or inferred_single_duration
        parsed_duration = normalize_duration(duration_value) if duration_value is not None else None
        task_type = item.get("schedule_type") or item.get("task_type") or item.get("taskType") or "flexible_task"
        due_value = item.get("start_at") if task_type == "fixed_event" else item.get("deadline_at")
        due_value = due_value or item.get("deadline") or item.get("due") or "未设置"
        payloads.append({
            "title": item.get("title") or "",
            "task_type": task_type,
            "domain_type": item.get("domain_type") or "general",
            "classification_rule": item.get("classification_rule") or "legacy_unclassified",
            "classification_validation": item.get("classification_validation") or {
                "valid": True,
                "errors": [],
                "checked_by": "legacy_parser",
            },
            "deadline": due_value,
            "due": due_value,
            "timezone": timezone_name,
            "start_at": item.get("start_at"),
            "deadline_at": item.get("deadline_at"),
            "deadline_assumption": "pydantic_ai_resolved" if item.get("deadline_at") else None,
            "estimated_duration": parsed_duration,
            "duration": parsed_duration,
            "priority": item.get("priority") if item.get("priority") in {"高", "中", "低"} else None,
            "context": item.get("context") or source_text,
            "missing_fields": item.get("missing_fields") or [],
            "source_spans": item.get("source_spans") or [],
            "confidence": item.get("confidence") or 0.0,
            "parser": parser_name,
        })
    return payloads


def build_task_previews(payloads: list[dict], *, parser_name: str, preview_id: Callable[[int], str]) -> list[dict]:
    previews: list[dict] = []
    for index, payload in enumerate(payloads):
        task_type = payload.get("task_type") or "flexible_task"
        due = payload.get("due") or payload.get("deadline") or "未设置"
        missing = list(payload.get("missing_fields") or [])
        if not str(payload.get("title") or "").strip():
            missing.append("title")
        if due == "未设置":
            missing.append("start_at" if task_type == "fixed_event" else "deadline_at")
        if payload.get("duration") is None and payload.get("estimated_duration") is None:
            missing.append("duration_minutes")
        previews.append({
            **payload,
            "id": preview_id(index),
            "parser": parser_name,
            "is_preview": True,
            "missing_fields": list(dict.fromkeys(missing)),
            "source_spans": payload.get("source_spans") or [],
            "confidence": float(payload.get("confidence") or 0.0),
        })
    return previews
