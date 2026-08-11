"""Deterministic content classification for already-parsed tasks."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TaskClassification:
    domain_type: str
    rule_id: str


_RULES = (
    ("personal", "personal_household", r"\b(?:laundry|groceries|shopping|clean|cook)\b|洗衣|家务|打扫|买菜|做饭"),
    ("admin", "communication_admin", r"\b(?:supervisor update|meeting|email|presentation|send)\b|汇报|会议|组会|邮件|答辩"),
    ("admin", "formatting_admin", r"\b(?:format|reference|citation|proofread|organize files?)\b|格式|参考文献|引用|校对|整理文件"),
    ("coding", "software_development", r"\b(?:code|coding|implement|debug|prototype)\b|代码|实现|调试|原型"),
    ("reading", "research_reading", r"\b(?:read|literature review|paper review)\b|阅读|文献|综述"),
    ("writing", "research_writing", r"\b(?:write|revise|findings section|research)\b|写作|撰写|论文|研究"),
    ("learning", "learning_content", r"\b(?:podcast|course|lecture|learn|study|practice english)\b|播客|课程|讲座|学习|练习英语"),
)


def classify_task(title: str, context: str = "") -> TaskClassification:
    searchable = f"{title}\n{context}".strip()
    for domain_type, rule_id, pattern in _RULES:
        if re.search(pattern, searchable, re.IGNORECASE):
            return TaskClassification(domain_type=domain_type, rule_id=rule_id)
    return TaskClassification(domain_type="general", rule_id="default_general")

