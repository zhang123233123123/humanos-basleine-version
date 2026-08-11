"""Dependency-free typed contract for facts extracted from task text."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


ScheduleType = Literal["fixed_event", "flexible_task", "recovery_task"]


def _duration(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        minutes = int(float(value))
    except (TypeError, ValueError):
        return None
    return minutes if 1 <= minutes <= 1440 else None


def _priority(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    aliases = {
        "high": "高", "medium": "中", "low": "低",
        "高": "高", "高优先级": "高",
        "中": "中", "中优先级": "中",
        "低": "低", "低优先级": "低",
    }
    return aliases.get(text)


@dataclass(slots=True)
class ParsedTaskContract:
    title: str
    schedule_type: ScheduleType = "flexible_task"
    duration_minutes: int | None = None
    start_at: str | None = None
    deadline_at: str | None = None
    priority: str | None = None
    context: str = ""
    missing_fields: list[str] = field(default_factory=list)
    source_spans: list[str] = field(default_factory=list)
    confidence: float = 0.0

    @classmethod
    def from_mapping(cls, raw: dict[str, Any], *, source_text: str = "") -> "ParsedTaskContract":
        schedule_type = str(raw.get("schedule_type") or raw.get("task_type") or "flexible_task")
        if schedule_type not in {"fixed_event", "flexible_task", "recovery_task"}:
            schedule_type = "flexible_task"
        duration = _duration(raw.get("duration_minutes"))
        if duration is None:
            duration = _duration(raw.get("estimated_duration") or raw.get("duration"))
        start_at = str(raw.get("start_at") or "").strip() or None
        deadline_at = str(raw.get("deadline_at") or "").strip() or None
        fallback_time = str(raw.get("deadline") or raw.get("due") or "").strip() or None
        if schedule_type == "fixed_event" and not start_at:
            start_at = fallback_time
        elif schedule_type != "fixed_event" and not deadline_at:
            deadline_at = fallback_time
        missing = [str(item) for item in (raw.get("missing_fields") or []) if str(item).strip()]
        required_time = "start_at" if schedule_type == "fixed_event" else "deadline_at"
        if not (start_at if schedule_type == "fixed_event" else deadline_at):
            missing.append(required_time)
        if duration is None:
            missing.append("duration_minutes")
        try:
            confidence = min(max(float(raw.get("confidence") or 0.0), 0.0), 1.0)
        except (TypeError, ValueError):
            confidence = 0.0
        spans = [str(item) for item in (raw.get("source_spans") or []) if str(item).strip()]
        return cls(
            title=str(raw.get("title") or "").strip()[:160],
            schedule_type=schedule_type,  # type: ignore[arg-type]
            duration_minutes=duration,
            start_at=start_at,
            deadline_at=deadline_at,
            priority=_priority(raw.get("priority")),
            context=str(raw.get("context") or source_text).strip(),
            missing_fields=list(dict.fromkeys(missing)),
            source_spans=spans,
            confidence=confidence,
        )

    def to_mapping(self) -> dict[str, Any]:
        return asdict(self)
