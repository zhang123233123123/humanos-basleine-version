"""Localized reply templates for chat use cases."""

from __future__ import annotations

import re


def message_locale(text: str) -> str:
    return "zh" if re.search(r"[\u3400-\u9fff]", text) else "en"


def task_preview_reply(text: str, count: int) -> str:
    if message_locale(text) == "zh":
        return f"我识别到 {count} 个任务。请先检查或修改；确认后才会保存任务并生成日历草案。"
    return f"I identified {count} task{'s' if count != 1 else ''}. Review or edit {'them' if count != 1 else 'it'} first; confirmation is required before saving and scheduling."


def progress_reply(text: str) -> str:
    if message_locale(text) == "zh":
        return "已记录当前进度。你可以补充下一步行动，或者要求根据当前状态重新规划。"
    return "Progress recorded. Add the next action, or ask me to replan from the current state."


def interruption_reply(text: str) -> str:
    if message_locale(text) == "zh":
        return "已收到暂停信号。请记录暂停原因、当前进度和恢复时的第一个行动。"
    return "Pause signal received. Record the reason, current progress, and first action for returning."
