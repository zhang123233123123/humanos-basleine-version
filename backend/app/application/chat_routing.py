"""Pure routing policy for the task-planning chat entry point."""

from __future__ import annotations

import re

from ..domain.intent.models import IntentDecision

TASK_INPUT_SIGNAL = re.compile(
    r"任务|写|读|阅读|整理|完成|复习|学习|开会|会议|取|拿|办|买|发|看|做|"
    r"分钟|小时|点|时|明天|今天|周|"
    r"\b(?:add|create|schedule|analyze|analyse|revise|write|read|review|study|prepare|submit|do)\b",
    re.I,
)


def should_parse_task_candidates(
    text: str,
    decision: IntentDecision,
    *,
    compact_multi_task: bool = False,
    english_multi_task: bool = False,
) -> bool:
    if decision.intent in {"progress_update", "interruption", "report_state"}:
        return False
    if decision.intent == "add_task":
        return True
    return bool(TASK_INPUT_SIGNAL.search(text)) and (
        decision.intent in {"reschedule", "other"}
        or compact_multi_task
        or english_multi_task
    )


def normalized_chat_intent(decision: IntentDecision, has_task_preview: bool) -> str:
    return "add_task" if has_task_preview else decision.intent
