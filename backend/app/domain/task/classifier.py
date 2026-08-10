"""Deterministic business classification for already-parsed tasks."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal


TaskDomain = Literal[
    "deep_work",
    "communication",
    "creative_work",
    "admin",
    "personal",
    "learning",
    "general",
]


@dataclass(frozen=True)
class TaskClassification:
    domain_type: TaskDomain
    rule_id: str


_RULES: tuple[tuple[TaskDomain, str, str], ...] = (
    ("personal", "personal_household", r"\b(?:laundry|groceries|shopping|clean|cook)\b|洗衣|洗衣服|家务|打扫|买菜|做饭"),
    ("communication", "communication_update", r"\b(?:supervisor update|meeting|email|presentation|report to|send)\b|汇报|会议|开会|邮件|沟通|答辩"),
    ("admin", "admin_formatting", r"\b(?:format|reference|citation|proofread|organize files?)\b|格式|参考文献|引用|校对|整理文件"),
    ("creative_work", "creative_visual", r"\b(?:diagram|figure|visuali[sz]e|design|illustration)\b|图表|示意图|设计|绘图|可视化"),
    ("learning", "learning_content", r"\b(?:podcast|course|lecture|learn|study|practice english)\b|播客|课程|讲座|学习|练习英语"),
    ("deep_work", "research_deep_work", r"\b(?:analy[sz]e|interview transcript|literature review|findings section|research|write|revise|review)\b|分析|访谈|文献综述|研究|写作|撰写|修改"),
)


def classify_task(title: str, context: str = "") -> TaskClassification:
    searchable = f"{title}\n{context}".strip()
    for domain_type, rule_id, pattern in _RULES:
        if re.search(pattern, searchable, re.IGNORECASE):
            return TaskClassification(domain_type=domain_type, rule_id=rule_id)
    return TaskClassification(domain_type="general", rule_id="default_general")
