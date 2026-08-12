"""Pure policies and fallback summaries for the read-only Calendar Advisor."""

from __future__ import annotations

import re
from datetime import datetime

QUERY_MARKERS = re.compile(r"查看|总结|查询|解释|为什么|哪些|什么|空闲|下一个|show|summarize|what|why|when|free|next", re.I)
WRITE_MARKERS = re.compile(r"创建|新增|帮我安排|调整|移动|删除|改到|推迟|提前|create|add|schedule|move|reschedule|delete", re.I)


def advisor_requires_planner_handoff(text: str) -> bool:
    return bool(WRITE_MARKERS.search(text)) and not bool(QUERY_MARKERS.search(text))


def sessions_for_local_date(sessions: list[dict], tasks: list[dict], current: datetime) -> list[dict]:
    task_map = {str(task.get("id")): task for task in tasks}
    result: list[dict] = []
    for session in sessions:
        try:
            start = datetime.fromisoformat(str(session.get("planned_start_at") or "").replace("Z", "+00:00"))
            if start.tzinfo is None:
                start = start.replace(tzinfo=current.tzinfo)
            if start.astimezone(current.tzinfo).date() != current.date() or session.get("status") == "superseded":
                continue
            task = task_map.get(str(session.get("task_id"))) or {}
            result.append({**session, "task_title": task.get("title") or session.get("task_id")})
        except (TypeError, ValueError):
            continue
    return sorted(result, key=lambda item: str(item.get("planned_start_at") or ""))


def fallback_calendar_summary(today_sessions: list[dict], tasks: list[dict], current: datetime, locale: str) -> str:
    running = next((item for item in today_sessions if item.get("status") == "running"), None)
    upcoming = next((item for item in today_sessions if item.get("status") in {"ready", "paused"}), None)
    if locale == "zh":
        lines = [f"今天共有 {len(today_sessions)} 个执行时段。"]
        if running:
            lines.append(f"当前正在进行：{running['task_title']}。")
        if upcoming:
            start_label = datetime.fromisoformat(str(upcoming["planned_start_at"]).replace("Z", "+00:00")).astimezone(current.tzinfo).strftime("%H:%M")
            lines.append(f"下一项：{start_label} {upcoming['task_title']}（{upcoming['status']}）。")
        if not today_sessions:
            standalone = [task for task in tasks if str(task.get("start_at") or "").startswith(current.date().isoformat())]
            lines.append(f"当前没有计划 Session；日历中有 {len(standalone)} 个独立任务。")
        return "\n".join(lines)
    lines = [f"You have {len(today_sessions)} execution sessions today."]
    if running:
        lines.append(f"In progress: {running['task_title']}.")
    if upcoming:
        start_label = datetime.fromisoformat(str(upcoming["planned_start_at"]).replace("Z", "+00:00")).astimezone(current.tzinfo).strftime("%H:%M")
        lines.append(f"Next: {upcoming['task_title']} at {start_label} ({upcoming['status']}).")
    if not today_sessions:
        lines.append("There are no planned execution sessions today.")
    return "\n".join(lines)
