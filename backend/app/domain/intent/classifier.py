"""Deterministic intent policy.

The LLM may suggest an intent, but explicit temporal and completion evidence
owns the final routing decision. This module is pure and has no persistence or
network dependencies.
"""

from __future__ import annotations

import re

from .models import IntentDecision, IntentEvidence

TASK_ACTION = re.compile(
    r"复习|学习|写|读|阅读|分析|修改|制作|创建|总结|整理|完成|处理|准备|提交|开会|会议|组会|做|"
    r"\b(?:add|analyze|analyse|revise|create|format|listen|finish|complete|write|read|review|study|prepare|submit|do)\b",
    re.I,
)
FUTURE_REQUEST = re.compile(
    r"我(?:需要|要|想|计划)|需要(?:在|于)?|待办|安排|计划|"
    r"\b(?:need to|have to|want to|plan to|please add|schedule)\b",
    re.I,
)
DEADLINE = re.compile(
    r"(?:今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]).{0,16}(?:前|之前|截止|完成)|"
    r"(?:前|之前)\s*(?:完成|做完|写完)|deadline|\bdue\b|\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
    re.I,
)
ESTIMATED_DURATION = re.compile(
    r"(?:大概|大约|预计|需要|持续)*\s*(?:\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(?:个\s*)?(?:分钟|小时)|"
    r"\b(?:about|roughly|approximately|estimated?)\s+\d+(?:\.\d+)?\s*(?:minutes?|hours?)\b",
    re.I,
)
COMPLETED_PROGRESS = re.compile(
    r"(?:已经|刚刚|刚才|目前|现在)(?:.{0,12})(?:完成了|做完了|写完了|读完了|进行了|做了|进展)|"
    r"(?:完成了|做完了|写完了|读完了)\s*(?:\d+%|一部分|一些|半)|"
    r"\b(?:i have|i've|already|just)\s+(?:finished|completed|done|worked)\b",
    re.I,
)
RESCHEDULE = re.compile(r"改成|改为|调整到|移到|挪到|提前到|推迟到|改期|reschedul|\bmove\b.{0,20}\bto\b", re.I)
INTERRUPTION = re.compile(r"中断|暂停|先不做|停止|切换任务|\b(?:pause|interrupt|stop for now)\b", re.I)
STATE_REPORT = re.compile(r"我(?:很)?(?:累|困|焦虑|有压力)|没精力|无法专注|集中不了", re.I)
EXISTING_REFERENCE = re.compile(r"这个任务|那个任务|原来(?:的)?任务|之前(?:的)?任务|组会|会议|\b(?:this|that|existing) task\b", re.I)


def extract_intent_evidence(text: str) -> IntentEvidence:
    clean = text.strip()
    return IntentEvidence(
        task_action=bool(TASK_ACTION.search(clean)),
        future_request=bool(FUTURE_REQUEST.search(clean)),
        deadline=bool(DEADLINE.search(clean)),
        estimated_duration=bool(ESTIMATED_DURATION.search(clean)),
        completed_progress=bool(COMPLETED_PROGRESS.search(clean)),
        reschedule=bool(RESCHEDULE.search(clean)),
        interruption=bool(INTERRUPTION.search(clean)),
        state_report=bool(STATE_REPORT.search(clean)),
        existing_task_reference=bool(EXISTING_REFERENCE.search(clean)),
    )


def classify_intent(text: str, model_suggestion: str | None = None) -> IntentDecision:
    evidence = extract_intent_evidence(text)
    if evidence.reschedule and (evidence.existing_task_reference or evidence.task_action):
        return IntentDecision("reschedule", 0.99, "explicit_schedule_change", evidence, model_suggestion)
    if evidence.interruption:
        return IntentDecision("interruption", 0.99, "explicit_interruption", evidence, model_suggestion)
    # Future/deadline language owns the word `完成`: “周五前完成” describes
    # intended work, whereas “已经完成了” reports progress.
    if evidence.task_action and (evidence.future_request or evidence.deadline or evidence.estimated_duration) and not evidence.completed_progress:
        return IntentDecision("add_task", 0.99, "future_task_with_temporal_evidence", evidence, model_suggestion)
    if evidence.completed_progress:
        return IntentDecision("progress_update", 0.98, "explicit_past_or_current_progress", evidence, model_suggestion)
    if evidence.state_report:
        return IntentDecision("report_state", 0.97, "explicit_state_report", evidence, model_suggestion)
    if model_suggestion in {"add_task", "reschedule", "progress_update", "interruption", "report_state"}:
        return IntentDecision(model_suggestion, 0.65, "model_suggestion_without_conflicting_evidence", evidence, model_suggestion)
    if evidence.task_action:
        return IntentDecision("add_task", 0.8, "executable_task_action", evidence, model_suggestion)
    return IntentDecision("other", 0.5, "no_actionable_intent_evidence", evidence, model_suggestion)
