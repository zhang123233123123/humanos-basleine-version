"""LangGraph orchestration for HumanOS scheduling.

The graph is dependency-tolerant: when `langgraph` is installed, HumanOS uses a
real StateGraph. Without it, the same nodes run sequentially so the MVP remains
usable on a clean machine.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timedelta
from typing import Any, TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class HumanOSState(TypedDict, total=False):
    user_id: str
    payload: dict[str, Any]
    profile: dict[str, Any]
    tasks: list[dict[str, Any]]
    runtime_state: dict[str, Any]
    query: str
    memories: list[dict[str, Any]]
    plan_patch: list[dict[str, Any]]
    joint_state: dict[str, Any]
    candidate_actions: list[dict[str, Any]]
    parallel_suggestions: list[dict[str, Any]]
    explanation: str
    confidence: str | dict[str, Any]
    requires_confirmation: bool
    reasons: list[str]
    decision: dict[str, Any]
    constraint_summary: dict[str, Any]
    unscheduled_tasks: list[dict[str, Any]]
    low_confidence_demand: list[dict[str, Any]]
    ai_task_analysis: dict[str, Any]
    candidate_plans: list[dict[str, Any]]
    validation: dict[str, Any]
    repair_suggestions: list[dict[str, Any]]


def load_profile_node(store: Any):
    def node(state: HumanOSState) -> HumanOSState:
        profile = dict(store.ensure_profile(state["user_id"]))
        client_context = (state.get("payload") or {}).get("client_context") or {}
        if client_context.get("timezone"):
            profile["timezone"] = client_context["timezone"]
        if client_context.get("now"):
            profile["_client_now"] = client_context["now"]
        return {"profile": profile}

    return node


def load_task_state_node(store: Any):
    def node(state: HumanOSState) -> HumanOSState:
        payload = state.get("payload", {})
        user_id = state["user_id"]
        all_tasks = payload.get("tasks") or store.list_tasks(user_id)
        profile = state.get("profile") or store.ensure_profile(user_id)
        week_id = str(payload.get("week_id") or profile.get("active_week_id") or (profile.get("weekly_context") or {}).get("week_id") or "")
        tasks = [
            task for task in all_tasks
            if not task.get("removed_from_week")
            and (not week_id or not task.get("week_id") or str(task.get("week_id")) == week_id)
        ]
        runtime_state = payload.get("runtime_state") or store.latest_runtime_state(user_id)
        query = payload.get("query") or store.build_schedule_query(tasks, runtime_state)
        return {"tasks": tasks, "runtime_state": runtime_state, "query": query}

    return node


def retrieve_memory_node(store: Any):
    def node(state: HumanOSState) -> HumanOSState:
        memories = store.search_memories(state["user_id"], state.get("query", ""), top_k=4)
        return {"memories": memories}

    return node


def analyze_inputs_node(store: Any):
    def node(state: HumanOSState) -> HumanOSState:
        analysis = store.analyze_schedule_inputs(state)
        return {"ai_task_analysis": analysis}

    return node


def parse_due_start_hour(due: str | None) -> float | None:
    text = str(due or "")
    colon_match = re.search(r"(\d{1,2})[:：](\d{2})", text)
    if colon_match:
        hour = int(colon_match.group(1))
        minute = int(colon_match.group(2))
        if re.search(r"下午|晚上", text) and hour < 12:
            hour += 12
        if "中午" in text and hour < 11:
            hour += 12
        return hour + minute / 60
    hour_match = re.search(r"(早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(点|时)", text)
    if not hour_match:
        return None
    period = hour_match.group(1) or ""
    hour = int(hour_match.group(2))
    if period in {"下午", "晚上"} and hour < 12:
        hour += 12
    if period == "中午" and hour < 11:
        hour += 12
    return float(hour)


WEEKDAY_INDEX = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}


def profile_now(profile: dict[str, Any] | None = None) -> datetime:
    data = profile or {}
    timezone_name = str(data.get("timezone") or "Asia/Shanghai")
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        timezone = ZoneInfo("UTC")
    client_now = str(data.get("_client_now") or "").strip()
    if client_now:
        try:
            parsed = datetime.fromisoformat(client_now.replace("Z", "+00:00"))
            return parsed.astimezone(timezone) if parsed.tzinfo else parsed.replace(tzinfo=timezone)
        except ValueError:
            pass
    return datetime.now(timezone)


def absolute_date_from_due(due: str | None, reference: datetime) -> datetime | None:
    text = str(due or "")
    match = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", text)
    if match:
        return reference.replace(year=int(match.group(1)), month=int(match.group(2)), day=int(match.group(3)))
    match = re.search(r"(?<!\d)(\d{1,2})[/-](\d{1,2})(?!\d)", text) or re.search(r"(\d{1,2})月(\d{1,2})日?", text)
    if match:
        candidate = reference.replace(month=int(match.group(1)), day=int(match.group(2)))
        if candidate.date() < reference.date() - timedelta(days=7):
            candidate = candidate.replace(year=candidate.year + 1)
        return candidate
    return None


def day_index_from_due(due: str | None, reference: datetime | None = None) -> int | None:
    text = str(due or "")
    current = reference or datetime.now()
    absolute = absolute_date_from_due(text, current)
    if absolute:
        week_start = (current - timedelta(days=current.weekday())).date()
        if not week_start <= absolute.date() <= week_start + timedelta(days=6):
            return None
        return absolute.weekday()
    if "下周" in text:
        return None
    match = re.search(r"(?:周|星期)([一二三四五六日天])", text)
    if match:
        return WEEKDAY_INDEX.get(match.group(1))
    today = current.weekday()
    offset = 2 if "后天" in text else 1 if "明天" in text else 0 if re.search(r"今天|今晚", text) else None
    if offset is None:
        return None
    target = today + offset
    return target if 0 <= target <= 6 else None


def segment_covers_day(segment: str, target_day: int) -> bool:
    range_match = re.search(r"周([一二三四五六日天])\s*(?:至|到|-)\s*周?([一二三四五六日天])", segment)
    if range_match:
        return WEEKDAY_INDEX[range_match.group(1)] <= target_day <= WEEKDAY_INDEX[range_match.group(2)]
    return any(WEEKDAY_INDEX[day] == target_day for day in re.findall(r"(?:周|星期)([一二三四五六日天])", segment))


def day_indices_from_text(text: str | None) -> list[int]:
    clean = str(text or "")
    indices: set[int] = set()
    if re.search(r"每天|每日", clean):
        indices.update(range(7))
    if "工作日" in clean:
        indices.update(range(5))
    if "周末" in clean:
        indices.update({5, 6})
    for start_text, end_text in re.findall(r"周([一二三四五六日天])\s*(?:至|到|[-–—])\s*周?([一二三四五六日天])", clean):
        start, end = WEEKDAY_INDEX[start_text], WEEKDAY_INDEX[end_text]
        indices.update(range(start, end + 1))
    indices.update(WEEKDAY_INDEX[day] for day in re.findall(r"(?:周|星期)([一二三四五六日天])", clean))
    return sorted(indices)


def parse_clock_token(token: str, context: str = "") -> float | None:
    match = re.search(r"(\d{1,2})(?:[:：](\d{2}))?", token)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    token_period = re.search(r"早上|上午|中午|下午|晚上", token)
    fallback_period = re.search(r"早上|上午|中午|下午|晚上", context)
    period = token_period.group(0) if token_period else fallback_period.group(0) if fallback_period else ""
    if period in {"下午", "晚上"} and hour < 12:
        hour += 12
    if period == "中午" and hour < 11:
        hour += 12
    return hour + minute / 60


def time_range_from_text(text: str | None) -> dict[str, Any] | None:
    clean = str(text or "")
    match = re.search(r"((?:(?:早上|上午|中午|下午|晚上)\s*)?\d{1,2}(?:[:：]\d{2})?)\s*(?:至|到|[-–—])\s*((?:(?:早上|上午|中午|下午|晚上)\s*)?\d{1,2}(?:[:：]\d{2})?)", clean)
    if match:
        start_period_match = re.search(r"早上|上午|中午|下午|晚上", match.group(1))
        start_period = start_period_match.group(0) if start_period_match else ""
        start = parse_clock_token(match.group(1))
        end = parse_clock_token(match.group(2), start_period)
        if start is not None and end is not None and end > start:
            return {"start": start, "end": end, "explicit_end": True}
    if re.search(r"上午|早上", clean):
        return {"start": 8.0, "end": 12.0, "explicit_end": True}
    if "中午" in clean:
        return {"start": 11.5, "end": 13.5, "explicit_end": True}
    if "下午" in clean:
        return {"start": 12.0, "end": 18.0, "explicit_end": True}
    if "晚上" in clean:
        return {"start": 18.0, "end": 23.0, "explicit_end": True}
    single = parse_due_start_hour(clean)
    return None if single is None else {"start": single, "end": None, "explicit_end": False}


def classify_weekly_activity(text: str) -> str:
    if re.search(r"^\s*(?:习惯时段|日常)", text):
        return "recurring_routine"
    if re.search(r"^\s*(?:灵活活动|可移动)", text):
        return "flexible_activity"
    if re.search(r"^\s*可灵活安排", text):
        return "flexible_activity"
    if re.search(r"^\s*(?:固定时间|固定)", text):
        return "fixed_event"
    if re.search(r"^\s*已占用", text):
        return "fixed_event"
    if re.search(r"午饭|晚饭|早餐|通勤|睡眠|接送|日常", text):
        return "recurring_routine"
    if re.search(r"健身|运动|洗衣|购物|打扫|散步", text):
        return "flexible_activity"
    return "fixed_event"


def list_value(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in re.split(r"[,，、/；;\n]", str(value or "")) if item.strip()]


def parse_available_windows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    weekly = profile.get("weekly_context", {})
    windows: list[dict[str, Any]] = []
    for item in weekly.get("available_windows") or []:
        if not isinstance(item, dict):
            continue
        try:
            day = int(item.get("day_index"))
            start = float(item.get("start"))
            end = float(item.get("end"))
        except (TypeError, ValueError):
            continue
        if day in range(7) and 0 <= start < end <= 24:
            windows.append({"day_index": day, "start": start, "end": end, "source": "structured_available_window"})
    if windows:
        return windows
    raw = str(weekly.get("weekly_available_windows") or "")
    if not raw.strip():
        return [
            {
                "day_index": day,
                "start": 8.0,
                "end": 22.0,
                "source": "system_default_missing_availability",
                "inferred": True,
                "confidence": "low",
            }
            for day in range(7)
        ]
    for segment in [item.strip() for item in re.split(r"[；;\n]", raw) if item.strip()]:
        days = day_indices_from_text(segment)
        time_range = time_range_from_text(segment)
        if not days or not time_range or not time_range["explicit_end"]:
            continue
        for day in days:
            windows.append({"day_index": day, "start": time_range["start"], "end": time_range["end"], "source": segment})
    return windows


def hard_constraint_intervals(profile: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    weekly = profile.get("weekly_context", {})
    items: list[dict[str, Any]] = []
    structured_items = [item for item in weekly.get("context_items", []) if isinstance(item, dict)]
    if structured_items:
        for item in structured_items:
            raw_type = str(item.get("type") or item.get("category") or "")
            activity_type = "recurring_routine" if raw_type in {"recurring_routine", "routine", "habit_period"} else "flexible_activity" if raw_type in {"flexible_activity", "ai_arranged"} else "temporary_constraint" if raw_type in {"temporary_constraint", "blocked_time"} else "fixed_event"
            if activity_type not in {"fixed_event", "temporary_constraint"}:
                continue
            start, end = item.get("start"), item.get("end")
            time_range = {"start": float(start), "end": float(end), "explicit_end": True} if isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start else None
            days = [int(day) for day in item.get("days", []) if str(day).isdigit()] or day_indices_from_text(str(item.get("day") or ""))
            prefix = "Blocked time" if activity_type == "temporary_constraint" else "Fixed time"
            text = f"{prefix} {item.get('day', '')} {item.get('title', '')}".strip()
            items.append({"id": item.get("id"), "text": text, "type": activity_type, "days": days, "range": time_range, "confirmed": item.get("confirmed") is not False})
    else:
        for text in list_value(weekly.get("fixed_events")):
            activity_type = classify_weekly_activity(text)
            if activity_type == "fixed_event":
                items.append({"id": None, "text": text, "type": activity_type, "days": day_indices_from_text(text), "range": time_range_from_text(text), "confirmed": bool(time_range_from_text(text))})
    if not any(item.get("type") == "temporary_constraint" for item in items):
        for text in list_value(weekly.get("temporary_constraints")):
            items.append({"text": text, "type": "temporary_constraint", "days": day_indices_from_text(text), "range": time_range_from_text(text)})
    for text in list_value(weekly.get("other_commitments") or weekly.get("important_deadlines")):
        items.append({"text": text, "type": "other_commitment", "days": day_indices_from_text(text), "range": time_range_from_text(text)})

    intervals: list[dict[str, Any]] = []
    uncertain: list[str] = []
    for item in items:
        if not item["days"] or not item["range"]:
            uncertain.append(item["text"])
            continue
        if item["range"]["end"] is None and item["type"] not in {"recurring_routine", "other_commitment"}:
            uncertain.append(item["text"])
            continue
        for day in item["days"]:
            end = item["range"]["end"]
            if end is None:
                end = item["range"]["start"] + (1 if item["type"] == "recurring_routine" else 0.5)
            intervals.append({
                "context_id": item.get("id"),
                "day_index": day,
                "start": item["range"]["start"],
                "end": min(end, 24.0),
                "label": item["text"],
                "source_type": item["type"],
                "inferred": item["range"]["end"] is None,
                "confidence": "medium" if item["range"]["end"] is None else "high",
            })
    return intervals, uncertain


def flexible_activity_duration_minutes(text: str) -> int:
    explicit = re.search(r"(?:时长|持续)\s*(\d+)\s*(分钟|min|小时|h)", text, re.IGNORECASE)
    if explicit:
        amount = int(explicit.group(1))
        return amount * 60 if re.search(r"小时|h", explicit.group(2), re.IGNORECASE) else amount
    if re.search(r"午饭|晚饭|早餐|吃饭|用餐", text):
        return 60
    if re.search(r"通勤|接送", text):
        return 45
    if re.search(r"健身|运动|购物", text):
        return 60
    return 45


def inferred_routine_defaults(text: str) -> dict[str, Any] | None:
    if re.search(r"早餐", text):
        return {"start": 7.5, "end": 8.25, "label": "Suggested 07:30-08:15", "confidence": "low"}
    if re.search(r"午饭|吃午饭", text):
        return {"start": 12.0, "end": 13.0, "label": "Suggested 12:00-13:00", "confidence": "low"}
    if re.search(r"晚饭", text):
        return {"start": 18.0, "end": 19.0, "label": "Suggested 18:00-19:00", "confidence": "low"}
    return None


def recurring_routine_intervals(profile: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    weekly = profile.get("weekly_context", {})
    structured_items = [item for item in weekly.get("context_items", []) if isinstance(item, dict)]
    routine_items: list[dict[str, Any]] = []
    if structured_items:
        for item in structured_items:
            raw_type = str(item.get("type") or item.get("category") or "")
            if raw_type not in {"recurring_routine", "routine", "habit_period"}:
                continue
            routine_items.append(item)
    else:
        for text in list_value(weekly.get("fixed_events")):
            if classify_weekly_activity(text) == "recurring_routine":
                time_range = time_range_from_text(text)
                routine_items.append({"id": None, "title": text, "day": "", "days": day_indices_from_text(text), "start": time_range.get("start") if time_range else None, "end": time_range.get("end") if time_range else None})

    intervals: list[dict[str, Any]] = []
    uncertain: list[str] = []
    for item in routine_items:
        text = f"日常 {item.get('day', '')} {item.get('title', '')}".strip()
        start, end = item.get("start"), item.get("end")
        defaults = inferred_routine_defaults(text)
        inferred = False
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or end <= start:
            if defaults:
                start, end = defaults["start"], defaults["end"]
                inferred = True
            else:
                uncertain.append(f"{text}（请填写习惯时段）")
                continue
        days = [int(day) for day in item.get("days", []) if str(day).isdigit()] or day_indices_from_text(str(item.get("day") or ""))
        if not days and defaults:
            days = list(range(7))
            inferred = True
        if not days:
            uncertain.append(f"{text}（请选择发生日期）")
            continue
        shift_minutes = max(int(item.get("shift_minutes") or 30), 0)
        for day in days:
            exceptions = item.get("routine_exceptions") if isinstance(item.get("routine_exceptions"), dict) else {}
            exception = exceptions.get(str(day)) or exceptions.get(day) or {}
            block_start = float(exception.get("start")) if isinstance(exception.get("start"), (int, float)) else float(start)
            block_end = float(exception.get("end")) if isinstance(exception.get("end"), (int, float)) else float(end)
            intervals.append({
                "context_id": item.get("id"),
                "day_index": day,
                "start": block_start,
                "end": block_end,
                "label": text,
                "source_type": "recurring_routine",
                "preferred_window": {"start": float(start), "end": float(end)},
                "availability_window": {"start": max(0.0, float(start) - shift_minutes / 60), "end": min(24.0, float(end) + shift_minutes / 60)},
                "movable": True,
                "shift_minutes": shift_minutes,
                "inferred": inferred or item.get("source") == "ai_default_suggestion",
                "confidence": item.get("confidence") or (defaults or {}).get("confidence") or "high",
                    "evidence": exception.get("reason") or item.get("evidence") or [value for value in [(defaults or {}).get("label"), f"May shift by up to {shift_minutes} minutes for urgent work"] if value],
            })
    return intervals, uncertain


def flexible_activity_intervals(profile: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    weekly = profile.get("weekly_context", {})
    intervals: list[dict[str, Any]] = []
    uncertain: list[str] = []
    structured_items = [item for item in weekly.get("context_items", []) if isinstance(item, dict)]
    activity_items: list[dict[str, Any]] = []
    available_windows = parse_available_windows(profile)
    if structured_items:
        for item in structured_items:
            if item.get("type") != "flexible_activity" and item.get("category") != "flexible_activity":
                continue
            start, end = item.get("start"), item.get("end")
            activity_range = {"start": float(start), "end": float(end), "explicit_end": True} if isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start else None
            days = [int(day) for day in item.get("days", []) if str(day).isdigit()] or day_indices_from_text(str(item.get("day") or ""))
            activity_items.append({"id": item.get("id"), "text": f"可灵活安排 {item.get('day', '')} {item.get('title', '')}".strip(), "days": days, "range": activity_range, "duration_minutes": item.get("duration_minutes"), "occurrence_mode": item.get("occurrence_mode") or "repeat_selected_days"})
    else:
        for text in list_value(weekly.get("fixed_events")):
            if classify_weekly_activity(text) == "flexible_activity":
                activity_items.append({"id": None, "text": text, "days": day_indices_from_text(text), "range": time_range_from_text(text), "duration_minutes": None})
    for item in activity_items:
        text = item["text"]
        days = item["days"]
        activity_range = item["range"]
        if not days:
            uncertain.append(f"{text}（请选择可以发生的日期）")
            continue
        explicit_duration = re.search(r"(?:时长|持续)\s*(\d+)\s*(分钟|min|小时|h)", text, re.IGNORECASE)
        requested_minutes = int(item.get("duration_minutes") or 0)
        if requested_minutes <= 0 and explicit_duration:
            requested_minutes = int(explicit_duration.group(1)) * (60 if re.search(r"小时|h", explicit_duration.group(2), re.IGNORECASE) else 1)
        if requested_minutes <= 0:
            uncertain.append(f"{text}（请确认预计时长；未确认前不会放入日历）")
            continue
        item_intervals: list[dict[str, Any]] = []
        for day in days:
            if activity_range and activity_range.get("explicit_end"):
                window_start = float(activity_range["start"])
                window_end = float(activity_range["end"])
                source = "用户提供日期、可发生范围与时长；AI 只在范围内选择具体时间"
            else:
                candidates = [window for window in available_windows if window["day_index"] == day and (window["end"] - window["start"]) * 60 >= requested_minutes]
                preferred = 17.0 if re.search(r"健身|运动|散步|购物", text) else 8.0 if "早餐" in text else 12.0 if "午饭" in text else 18.0 if "晚饭" in text else 9.0
                candidates.sort(key=lambda window: (abs(window["start"] - preferred), -(window["end"] - window["start"])))
                if not candidates:
                    uncertain.append(f"{text}（当天可用时间不足，暂未安排）")
                    continue
                window_start = float(candidates[0]["start"])
                window_end = float(candidates[0]["end"])
                source = "未要求具体时刻；AI 根据可用时间与正常作息选择候选位置"
            duration_minutes = min(requested_minutes, max(round((window_end - window_start) * 60), 15))
            preferred_start = 12.0 if re.search(r"午饭|吃午饭", text) else 18.0 if "晚饭" in text else 8.0 if "早餐" in text else window_start
            selected_start = max(window_start, min(preferred_start, window_end - duration_minutes / 60))
            item_intervals.append({
                "context_id": item.get("id"),
                "day_index": day,
                "start": selected_start,
                "end": selected_start + duration_minutes / 60,
                "label": text,
                "source_type": "flexible_activity",
                "availability_window": {"start": window_start, "end": window_end},
                "inferred": True,
                "confidence": "medium",
                "evidence": source,
            })
        if item.get("occurrence_mode") == "once_this_week":
            if item_intervals:
                intervals.append(sorted(item_intervals, key=lambda block: (block["day_index"], block["start"]))[0])
        else:
            intervals.extend(item_intervals)
    return intervals, uncertain


def subtract_interval(window: dict[str, Any], busy: dict[str, Any]) -> list[dict[str, Any]]:
    if busy["end"] <= window["start"] or busy["start"] >= window["end"]:
        return [window]
    parts = []
    if busy["start"] > window["start"]:
        parts.append({**window, "end": min(busy["start"], window["end"])})
    if busy["end"] < window["end"]:
        parts.append({**window, "start": max(busy["end"], window["start"])})
    return [part for part in parts if part["end"] - part["start"] >= 0.25]


def build_scheduling_context(profile: dict[str, Any]) -> dict[str, Any]:
    weekly = profile.get("weekly_context", {})
    raw_rest_minutes = int(profile.get("task_preferences", {}).get("rest_between_tasks_minutes") or 15)
    rest_minutes = max(15, round(raw_rest_minutes / 15) * 15)
    intervals, uncertain = hard_constraint_intervals(profile)
    routine_blocks, routine_uncertain = recurring_routine_intervals(profile)
    flexible_blocks, flexible_uncertain = flexible_activity_intervals(profile)
    transition_blocks = [
        {
            "day_index": item["day_index"],
            "start": item["end"],
            "end": min(item["end"] + rest_minutes / 60, 24.0),
            "label": "Transition break",
            "source_type": "recovery_transition",
            "inferred": True,
            "confidence": "medium",
            "evidence": f"{rest_minutes} minutes are protected after a fixed event before another task starts.",
        }
        for item in intervals
        if item.get("source_type") == "fixed_event" and item.get("end", 24.0) < 24.0
    ]
    flexible_blocks.extend([*routine_blocks, *transition_blocks])
    windows = parse_available_windows(profile)
    for busy in [*intervals, *flexible_blocks]:
        windows = [part for window in windows for part in (subtract_interval(window, busy) if window["day_index"] == busy["day_index"] else [window])]
    keep_buffer = weekly.get("keep_buffer") is not False
    buffer_blocks: list[dict[str, Any]] = []
    if keep_buffer:
        buffered: list[dict[str, Any]] = []
        for day in range(7):
            day_windows = sorted((window for window in windows if window["day_index"] == day), key=lambda item: item["start"])
            total_minutes = sum((window["end"] - window["start"]) * 60 for window in day_windows)
            reserve_left = max(rest_minutes, round(total_minutes * 0.15)) if total_minutes else 0
            adjusted = [{**window, "reserved_buffer_minutes": 0} for window in day_windows]
            for window in reversed(adjusted):
                available = max((window["end"] - window["start"]) * 60 - 15, 0)
                take = min(reserve_left, available)
                if take <= 0:
                    continue
                # Keep task boundaries on the same 15-minute grid used by the calendar.
                # Rounding down reserves at least the requested amount of Buffer.
                buffer_start = math.floor((window["end"] - take / 60 + 1e-9) * 4) / 4
                buffer_blocks.append({
                    "day_index": day,
                    "start": buffer_start,
                    "end": window["end"],
                "label": "Adjustable buffer",
                    "source_type": "buffer",
                })
                window["end"] = buffer_start
                window["reserved_buffer_minutes"] += round(take)
                reserve_left -= take
            buffered.extend(window for window in adjusted if window["end"] - window["start"] >= 0.25)
        windows = buffered
    movable_routine_windows = parse_available_windows(profile)
    non_routine_busy = [
        *intervals,
        *(item for item in flexible_blocks if item.get("source_type") != "recurring_routine"),
        *buffer_blocks,
    ]
    for busy in non_routine_busy:
        movable_routine_windows = [part for window in movable_routine_windows for part in (subtract_interval(window, busy) if window["day_index"] == busy["day_index"] else [window])]
    return {
        "windows": windows,
        "movable_routine_windows": movable_routine_windows,
        "hard_constraints": intervals,
        "flexible_activity_blocks": flexible_blocks,
        "routine_blocks": routine_blocks,
        "buffer_blocks": buffer_blocks,
        "uncertain_constraints": [*uncertain, *routine_uncertain, *flexible_uncertain],
        "keep_buffer": keep_buffer,
        "rest_minutes": rest_minutes,
        "availability_assumptions": [
            "No availability was provided; HumanOS temporarily assumes 08:00-22:00 every day. Confirm or edit this in Settings."
        ] if any(window.get("source") == "system_default_missing_availability" for window in parse_available_windows(profile)) else [],
    }


def task_demand_hypothesis(task: dict[str, Any]) -> dict[str, Any]:
    raw_expected = task.get("expected_difficulty") or task.get("task_demand", {}).get("expected_difficulty")
    expected = int(raw_expected) if str(raw_expected or "").isdigit() else None
    if expected is not None:
        return {
            "level": "high" if expected >= 6 else "low" if expected <= 2 else "medium",
            "expected_difficulty": expected,
            "evidence": task.get("task_demand", {}).get("evidence") or [f"user expected_difficulty={expected}/7"],
            "confidence": task.get("task_demand", {}).get("confidence_level") or "high",
        }
    text = f"{task.get('title', '')} {task.get('context', '')}"
    high = bool(re.search(r"论文|写作|编程|代码|分析|研究|设计|复杂|初稿|proposal", text, re.I))
    low = bool(re.search(r"邮件|整理|预约|打印|提交|行政|纪要", text, re.I))
    label = "demanding" if high else "light" if low else "moderate"
    return {"level": "high" if high else "low" if low else "medium", "expected_difficulty": None, "evidence": [f"AI initial estimate from the task name and description: {label}"], "confidence": "low"}


def scheduler_node(_: Any):
    def node(state: HumanOSState) -> HumanOSState:
        tasks = state.get("tasks", [])
        runtime_state = state.get("runtime_state", {})
        profile = state.get("profile", {})
        ai_analysis = state.get("ai_task_analysis", {}) or {}
        energy = int(runtime_state.get("energy", 4))
        focus = int(runtime_state.get("focus", 4))
        stress = int(runtime_state.get("stress", 4))
        high_capacity_state = focus >= 6 and energy >= 5 and stress <= 5
        low_capacity_state = focus <= 2 or energy <= 2 or stress >= 6
        context = build_scheduling_context(profile)
        rest_minutes = context["rest_minutes"]
        preferred_session_minutes = min(
            max(round(int(profile.get("task_preferences", {}).get("preferred_session_minutes") or 45) / 15) * 15, 15),
            180,
        )
        now = profile_now(profile)
        today_index = now.weekday()
        current_hour = now.hour + now.minute / 60
        next_quarter_hour = min(24.0, round((current_hour + 0.2499) * 4) / 4)
        palette = ["blue", "green", "violet", "gold"]
        priority_rank = {"高": 0, "中": 1, "低": 2}
        deep_work_start = parse_due_start_hour(profile.get("deep_work_window")) or 9.0
        low_energy_start = parse_due_start_hour(profile.get("low_energy_window")) or 14.0

        def snap_up_quarter(hour: float) -> float:
            return math.ceil((float(hour) - 1e-9) * 4) / 4

        def snap_down_quarter(hour: float) -> float:
            return math.floor((float(hour) + 1e-9) * 4) / 4
        needs_clarification: list[dict[str, Any]] = []
        blocked_tasks: list[dict[str, Any]] = []
        ready_tasks: list[dict[str, Any]] = []
        low_confidence_demand: list[dict[str, Any]] = []

        def task_kind(task: dict[str, Any]) -> str:
            return str(task.get("task_type") or task.get("contextWindow", {}).get("taskType") or task.get("context_window", {}).get("taskType") or "flexible_task")

        for task in tasks:
            if task.get("status") in {"completed", "terminated", "paused"}:
                continue
            if task.get("status") == "blocked":
                blocked_tasks.append(task)
                continue
            missing = [key for key in ("due", "duration") if not task.get(key) or task.get(key) == "未设置"]
            if task_kind(task) == "fixed_event" and task.get("due") and task.get("due") != "未设置" and parse_due_start_hour(task.get("due")) is None:
                missing.append("due_time")
            if task.get("due") and day_index_from_due(task.get("due"), now) is None:
                missing.append("outside_current_week_or_unresolved_date")
            if missing:
                needs_clarification.append({"task_id": task.get("id"), "missing": missing})
                continue
            ready_tasks.append(task)

        ai_demands = {
            str(item.get("task_id")): item
            for item in ai_analysis.get("task_demands", [])
            if isinstance(item, dict) and item.get("task_id")
        }
        dependencies = [
            item for item in ai_analysis.get("dependencies", [])
            if isinstance(item, dict) and item.get("hard_enforced") is True
        ]
        ready_task_ids = {str(task.get("id")) for task in ready_tasks}
        dependency_predecessors: dict[str, list[str]] = {}
        for edge in dependencies:
            before = str(edge.get("before_task_id") or edge.get("predecessor_task_id") or "")
            after = str(edge.get("after_task_id") or edge.get("successor_task_id") or "")
            if before in ready_task_ids and after in ready_task_ids and before != after:
                dependency_predecessors.setdefault(after, []).append(before)

        def demand_for(task: dict[str, Any]) -> dict[str, Any]:
            fallback = task_demand_hypothesis(task)
            hypothesis = ai_demands.get(str(task.get("id")))
            if fallback.get("expected_difficulty") is not None or (task.get("task_demand") or {}).get("user_confirmed"):
                return fallback
            if not hypothesis:
                return fallback
            level = hypothesis.get("level") if hypothesis.get("level") in {"low", "medium", "high"} else fallback["level"]
            evidence = [str(item) for item in hypothesis.get("evidence", []) if str(item).strip()] or fallback["evidence"]
            return {
                "level": level,
                "expected_difficulty": fallback.get("expected_difficulty"),
                "evidence": evidence,
                "confidence": hypothesis.get("confidence_level") or fallback["confidence"],
            }

        for task in ready_tasks:
            demand = demand_for(task)
            if demand["confidence"] == "low":
                low_confidence_demand.append({"task_id": task.get("id"), "title": task.get("title"), "evidence": demand["evidence"]})

        dependency_ranks = {str(task.get("id")): 0 for task in ready_tasks}
        for _ in range(len(ready_tasks)):
            changed = False
            for after, predecessors in dependency_predecessors.items():
                rank = max((dependency_ranks.get(before, 0) + 1 for before in predecessors), default=0)
                if rank > dependency_ranks.get(after, 0):
                    dependency_ranks[after] = rank
                    changed = True
            if not changed:
                break

        def task_remaining_minutes(task: dict[str, Any]) -> int:
            saved = (task.get("execution") or {}).get("remaining_duration_minutes")
            return max(int(task.get("duration", 0) if saved is None else saved), 0)

        def deadline_capacity_minutes(task: dict[str, Any]) -> int:
            due_day = day_index_from_due(task.get("due"), now)
            if due_day is None:
                return 0
            due_hour = parse_due_start_hour(task.get("due"))
            if due_hour is None:
                due_hour = max((window["end"] for window in context["windows"] if window["day_index"] == due_day), default=24.0)
            total = 0
            for window in context["windows"]:
                if window["day_index"] > due_day:
                    continue
                end = min(window["end"], due_hour) if window["day_index"] == due_day else window["end"]
                total += max(round((end - window["start"]) * 60), 0)
            return total

        def deadline_slack_minutes(task: dict[str, Any]) -> int:
            return deadline_capacity_minutes(task) - task_remaining_minutes(task)

        def ordered_tasks(strategy: str) -> list[dict[str, Any]]:
            def key(task: dict[str, Any]) -> tuple[Any, ...]:
                due_day = day_index_from_due(task.get("due"), now)
                dependency = dependency_ranks.get(str(task.get("id")), 0)
                high_load = 0 if demand_for(task)["level"] == "high" else 1
                low_load = 0 if demand_for(task)["level"] == "low" else 1
                state_fit = high_load if high_capacity_state else low_load if low_capacity_state else high_load
                urgent = 0 if deadline_slack_minutes(task) <= max(preferred_session_minutes, 60) else 1
                if strategy == "energy_fit":
                    return (dependency, urgent, state_fit, priority_rank.get(task.get("priority"), 1), due_day if due_day is not None else 7)
                if strategy == "balanced":
                    return (dependency, -task_remaining_minutes(task), priority_rank.get(task.get("priority"), 1), due_day if due_day is not None else 7)
                return (dependency, deadline_slack_minutes(task), due_day if due_day is not None else 7, priority_rank.get(task.get("priority"), 1))

            return sorted(ready_tasks, key=key)

        def initial_windows() -> list[dict[str, Any]]:
            usable = []
            for window in context["windows"]:
                if window["day_index"] < today_index:
                    continue
                candidate = {**window}
                if candidate["day_index"] == today_index:
                    candidate["start"] = max(candidate["start"], next_quarter_hour)
                if candidate["end"] - candidate["start"] >= 0.25:
                    usable.append(candidate)
            return usable

        def subtract_busy(windows: list[dict[str, Any]], block: dict[str, Any], include_rest: bool = True) -> list[dict[str, Any]]:
            busy = {
                "start": block["start"],
                "end": block["end"] + (rest_minutes / 60 if include_rest else 0),
            }
            return [
                part
                for window in windows
                for part in (subtract_interval(window, busy) if window["day_index"] == block["day_index"] else [window])
            ]

        def fixed_task_blocks(strategy: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
            blocks: list[dict[str, Any]] = []
            windows = initial_windows()
            for index, task in enumerate(ordered_tasks(strategy)):
                if task_kind(task) != "fixed_event":
                    continue
                day = day_index_from_due(task.get("due"), now)
                start = parse_due_start_hour(task.get("due"))
                if day is None or start is None:
                    continue
                minutes = max(int(task.get("duration") or 30), 5)
                block = {
                    "block_id": f"{task['id']}-fixed",
                    "task_id": task["id"],
                    "day_index": day,
                    "deadline_day_index": day,
                    "start": start,
                    "end": start + minutes / 60,
                    "color": "context",
                    "kind": "fixed_event",
                    "mode": "fixed",
                    "session_minutes": minutes,
                    "total_task_minutes": minutes,
                    "remaining_after_block_minutes": 0,
            "constraint_evidence": ["Fixed start time provided by the user"],
                    "state_scope": "fixed_context",
                }
                blocks.append(block)
                windows = subtract_busy(windows, block, include_rest=True)
            return blocks, windows

        default_deadline_assumptions: list[dict[str, Any]] = []

        def deadline_hour_for(task: dict[str, Any]) -> float:
            parsed = parse_due_start_hour(task.get("due"))
            if parsed is not None:
                return parsed
            deadline_day = day_index_from_due(task.get("due"), now)
            day_ends = [window["end"] for window in context["windows"] if window["day_index"] == deadline_day]
            assumed = max(day_ends) if day_ends else 24.0
            assumption = {
                "task_id": task.get("id"),
                "raw_deadline": task.get("due"),
                "assumed_deadline_hour": assumed,
                "reason": "Only a day was provided; using the end of the final available window that day as the temporary deadline.",
            }
            if not any(item.get("task_id") == task.get("id") for item in default_deadline_assumptions):
                default_deadline_assumptions.append(assumption)
            return assumed

        def candidate_score(window: dict[str, Any], start: float, task: dict[str, Any], strategy: str, daily_load: dict[int, int]) -> float:
            demand = demand_for(task)
            preferred_start = low_energy_start if demand["level"] == "low" else deep_work_start
            day_distance = max(window["day_index"] - today_index, 0)
            energy_penalty = abs(start - preferred_start)
            if strategy == "energy_fit":
                return energy_penalty * 12 + day_distance * 3 + daily_load.get(window["day_index"], 0) / 30
            if strategy == "balanced":
                return daily_load.get(window["day_index"], 0) * 2 + energy_penalty + day_distance / 5
            return day_distance * 30 + start / 24 + energy_penalty / 3

        def select_slot(
            windows: list[dict[str, Any]],
            task: dict[str, Any],
            requested_minutes: int,
            strategy: str,
            daily_load: dict[int, int],
            not_before: tuple[int, float] | None = None,
        ) -> dict[str, Any] | None:
            deadline_day = day_index_from_due(task.get("due"), now)
            if deadline_day is None:
                return None
            deadline_hour = deadline_hour_for(task)
            demand = demand_for(task)
            preferred_start = low_energy_start if demand["level"] == "low" else deep_work_start
            full_candidates: list[dict[str, Any]] = []
            partial_candidates: list[dict[str, Any]] = []
            minimum_useful_minutes = min(15, requested_minutes)
            for window in windows:
                if window["day_index"] > deadline_day:
                    continue
                if not_before and window["day_index"] < not_before[0]:
                    continue
                raw_window_start = max(window["start"], not_before[1]) if not_before and window["day_index"] == not_before[0] else window["start"]
                window_start = snap_up_quarter(raw_window_start)
                effective_end = min(window["end"], deadline_hour) if window["day_index"] == deadline_day else window["end"]
                available_minutes = max(int(round((effective_end - window_start) * 60)), 0)
                if available_minutes < minimum_useful_minutes:
                    continue
                session_minutes = min(requested_minutes, available_minutes)
                duration = session_minutes / 60
                candidate_window = {**window, "start": window_start}
                starts = [window_start]
                latest_start = max(window_start, effective_end - duration)
                preferred = min(max(round(preferred_start * 4) / 4, window_start), snap_down_quarter(latest_start))
                if abs(preferred - starts[0]) > 0.01:
                    starts.append(preferred)
                for start in starts:
                    if start + duration <= effective_end + 0.001:
                        candidate = {
                            "window": candidate_window,
                            "start": start,
                            "end": start + duration,
                            "session_minutes": session_minutes,
                            "score": candidate_score(candidate_window, start, task, strategy, daily_load),
                        }
                        (full_candidates if session_minutes == requested_minutes else partial_candidates).append(candidate)
            candidates = full_candidates or partial_candidates
            return min(candidates, key=lambda item: item["score"]) if candidates else None

        def validate_plan(blocks: list[dict[str, Any]], windows: list[dict[str, Any]]) -> dict[str, Any]:
            violations: list[dict[str, Any]] = []
            flexible_blocks = [block for block in blocks if block.get("kind") != "fixed_event"]
            for block in flexible_blocks:
                if block["day_index"] == today_index and block["start"] < next_quarter_hour - 0.001:
                    violations.append({"type": "past_time", "block_id": block["block_id"], "task_id": block["task_id"]})
                inside = any(
                    window["day_index"] == block["day_index"]
                    and block["start"] >= window["start"] - 0.001
                    and block["end"] <= window["end"] + 0.001
                    for window in context["windows"]
                )
                if not inside:
                    violations.append({"type": "outside_available_window", "block_id": block["block_id"], "task_id": block["task_id"]})
                task = next((item for item in ready_tasks if str(item.get("id")) == str(block.get("task_id"))), None)
                if task:
                    deadline_day = day_index_from_due(task.get("due"), now)
                    deadline_hour = deadline_hour_for(task)
                    if deadline_day is not None and (
                        block["day_index"] > deadline_day
                        or (block["day_index"] == deadline_day and block["end"] > deadline_hour + 0.001)
                    ):
                        violations.append({"type": "deadline", "block_id": block["block_id"], "task_id": block["task_id"]})
            for block in blocks:
                hard_conflict = next(
                    (
                        constraint for constraint in context["hard_constraints"]
                        if constraint["day_index"] == block["day_index"]
                        and block["start"] < constraint["end"]
                        and constraint["start"] < block["end"]
                    ),
                    None,
                )
                if hard_conflict:
                    violations.append({
                        "type": "fixed_constraint_conflict" if block.get("kind") == "fixed_event" else "hard_constraint_conflict",
                        "block_id": block["block_id"],
                        "task_id": block["task_id"],
                        "constraint": hard_conflict["label"],
                    })
            for day in range(7):
                ordered = sorted((block for block in blocks if block["day_index"] == day), key=lambda item: item["start"])
                for previous, current in zip(ordered, ordered[1:]):
                    if current["start"] < previous["end"] - 0.001:
                        violations.append({"type": "overlap", "block_ids": [previous["block_id"], current["block_id"]]})
            for after, predecessors in dependency_predecessors.items():
                after_blocks = [block for block in blocks if str(block.get("task_id")) == after]
                for before in predecessors:
                    before_blocks = [block for block in blocks if str(block.get("task_id")) == before]
                    if not before_blocks or not after_blocks:
                        continue
                    predecessor_end = max((block["day_index"], block["end"]) for block in before_blocks)
                    successor_start = min((block["day_index"], block["start"]) for block in after_blocks)
                    if successor_start < predecessor_end:
                        violations.append({
                            "type": "dependency_order",
                            "before_task_id": before,
                            "after_task_id": after,
                        })
            return {"valid": not violations, "violations": violations}

        def generate_candidate(strategy: str, label: str) -> dict[str, Any]:
            blocks, free_windows = fixed_task_blocks(strategy)
            daily_load: dict[int, int] = {}
            unscheduled: list[dict[str, Any]] = []
            for block in blocks:
                conflict = next(
                    (
                        constraint for constraint in context["hard_constraints"]
                        if constraint["day_index"] == block["day_index"]
                        and block["start"] < constraint["end"]
                        and constraint["start"] < block["end"]
                    ),
                    None,
                )
                if conflict:
                    block["constraint_conflict"] = True
                    block["constraint_evidence"].append(f"Conflicts with “{conflict['label']}”; the fixed event was not moved.")
                    unscheduled.append({
                        "task_id": block["task_id"],
                        "remaining_minutes": 0,
                        "reason": f"The fixed time conflicts with “{conflict['label']}”. The original time was preserved for the user to resolve.",
                    })
            capacity_score = max(0.0, min(1.0, (0.40 * energy + 0.35 * focus + 0.25 * (8 - stress)) / 7.0))
            low_capacity = low_capacity_state or capacity_score < 0.48
            today_state_used = False
            session_counter: dict[str, int] = {}
            flexible_tasks = [task for task in ordered_tasks(strategy) if task_kind(task) != "fixed_event"]
            for task_index, task in enumerate(flexible_tasks):
                execution = task.get("execution") or {}
                saved_remaining = execution.get("remaining_duration_minutes")
                raw_total_minutes = max(int(task.get("duration", 60) if saved_remaining is None else saved_remaining), 0)
                total_minutes = raw_total_minutes
                if total_minutes <= 0:
                    continue
                remaining = total_minutes
                deadline_day = day_index_from_due(task.get("due"), now)
                if deadline_day is None:
                    unscheduled.append({"task_id": task.get("id"), "remaining_minutes": remaining, "reason": "The completion deadline could not be interpreted."})
                    continue
                planned_session_count = max((total_minutes + preferred_session_minutes - 1) // preferred_session_minutes, 1)
                raw_balanced_minutes = (total_minutes + planned_session_count - 1) // planned_session_count
                balanced_session_minutes = max(round(raw_balanced_minutes / 15) * 15, 15)
                predecessor_ids = dependency_predecessors.get(str(task.get("id")), [])
                incomplete_predecessors = [
                    predecessor_id for predecessor_id in predecessor_ids
                    if (
                        not any(str(block.get("task_id")) == predecessor_id for block in blocks)
                        or any(
                            str(item.get("task_id")) == predecessor_id and int(item.get("remaining_minutes") or 0) > 0
                            for item in unscheduled
                        )
                    )
                ]
                if incomplete_predecessors:
                    unscheduled.append({
                        "task_id": task.get("id"),
                        "remaining_minutes": remaining,
                        "scheduled_minutes": 0,
                        "reason": "The prerequisite is not fully scheduled, so the dependent task cannot be placed yet.",
                        "blocked_by_task_ids": incomplete_predecessors,
                    })
                    continue
                predecessor_boundary = max(
                    (
                        (block["day_index"], block["end"])
                        for block in blocks
                        if str(block.get("task_id")) in predecessor_ids
                    ),
                    default=None,
                )
                demand = demand_for(task)
                safety = 0
                while remaining > 0 and safety < 100:
                    safety += 1
                    requested_work_minutes = min(balanced_session_minutes, remaining)
                    requested = max(15, int(math.ceil(requested_work_minutes / 15) * 15))
                    selected = select_slot(free_windows, task, requested, strategy, daily_load, predecessor_boundary)
                    if not selected:
                        break
                    session_minutes = selected["session_minutes"]
                    if (
                        not today_state_used
                        and selected["window"]["day_index"] == today_index
                        and low_capacity
                        and demand["level"] == "high"
                        and session_minutes > 25
                    ):
                        session_minutes = 30
                        selected["end"] = selected["start"] + session_minutes / 60
                        today_state_used = True
                        state_scope = "today_first_task_adjustment"
                    elif (
                        not today_state_used
                        and selected["window"]["day_index"] == today_index
                    ):
                        today_state_used = True
                        state_scope = "today_next_session_selected_from_momentary_state"
                    else:
                        state_scope = "weekly_skeleton"
                    session_counter[str(task["id"])] = session_counter.get(str(task["id"]), 0) + 1
                    planned_work_minutes = min(session_minutes, remaining)
                    remaining = max(remaining - planned_work_minutes, 0)
                    dependency_evidence = [
                        str(edge.get("reason"))
                        for edge in dependencies
                        if str(edge.get("after_task_id") or edge.get("successor_task_id") or "") == str(task.get("id")) and edge.get("reason")
                    ]
                    block = {
                        "block_id": f"{task['id']}-{strategy}-{session_counter[str(task['id'])]}",
                        "task_id": task["id"],
                        "day_index": selected["window"]["day_index"],
                        "deadline_day_index": deadline_day,
                        "start": selected["start"],
                        "end": selected["end"],
                        "color": palette[task_index % len(palette)],
                        "kind": "task_session",
                        "mode": "execution",
                        "session_index": session_counter[str(task["id"])],
                        "session_minutes": session_minutes,
                        "planned_work_minutes": planned_work_minutes,
                        "padding_minutes": session_minutes - planned_work_minutes,
                        "total_task_minutes": total_minutes,
                        "remaining_after_block_minutes": remaining,
                        "constraint_evidence": [
                            f"Available window: {selected['window']['source']}",
                            f"Deadline: {task.get('due')}",
                            f"Preferred focus-session length: {preferred_session_minutes} minutes",
                            f"Balanced session target: about {balanced_session_minutes} minutes",
                            *demand["evidence"],
                            *dependency_evidence,
                        ],
                        "state_scope": state_scope,
                    }
                    blocks.append(block)
                    daily_load[block["day_index"]] = daily_load.get(block["day_index"], 0) + session_minutes
                    free_windows = subtract_busy(free_windows, block)
                if remaining > 0:
                    unscheduled.append({
                        "task_id": task.get("id"),
                        "remaining_minutes": remaining,
                        "scheduled_minutes": total_minutes - remaining,
                        "reason": "There is not enough available time before the deadline to schedule all remaining work.",
                    })

            counts: dict[str, int] = {}
            for block in blocks:
                if block.get("kind") == "task_session":
                    counts[str(block["task_id"])] = counts.get(str(block["task_id"]), 0) + 1
            for block in blocks:
                if block.get("kind") == "task_session":
                    block["session_count"] = counts[str(block["task_id"])]

            validation = validate_plan(blocks, context["windows"])
            task_sessions = [block for block in blocks if block.get("kind") == "task_session"]
            scheduled_minutes = sum(block.get("planned_work_minutes", block.get("session_minutes", 0)) for block in task_sessions)
            active_days = sorted({window["day_index"] for window in context["windows"] if window["day_index"] >= today_index})
            day_loads = [daily_load.get(day, 0) for day in active_days] or [0]
            load_spread = max(day_loads) - min(day_loads)
            mean_load = sum(day_loads) / len(day_loads)
            load_variance = sum((load - mean_load) ** 2 for load in day_loads) / len(day_loads)
            task_by_id = {str(task.get("id")): task for task in ready_tasks}
            fit_scores = []
            for block in task_sessions:
                task = task_by_id.get(str(block.get("task_id")), {})
                preferred = low_energy_start if demand_for(task).get("level") == "low" else deep_work_start
                fit_scores.append(max(0.0, 1.0 - abs(float(block.get("start", preferred)) - preferred) / 6.0))
            cognitive_fit = sum(fit_scores) / len(fit_scores) if fit_scores else 1.0
            ordered_blocks = sorted(task_sessions, key=lambda block: (block["day_index"], block["start"]))
            context_switches = sum(
                1 for previous, current in zip(ordered_blocks, ordered_blocks[1:])
                if previous["day_index"] == current["day_index"] and previous.get("task_id") != current.get("task_id")
            )
            short_sessions = sum(1 for block in task_sessions if int(block.get("session_minutes") or 0) < min(preferred_session_minutes, 30))
            fragmentation_score = short_sessions / len(task_sessions) if task_sessions else 0.0
            remaining_total = sum(item.get("remaining_minutes", 0) for item in unscheduled)
            deadline_risk = sum(max(-deadline_slack_minutes(task), 0) for task in flexible_tasks)
            buffer_preserved = round(sum((block["end"] - block["start"]) * 60 for block in context["buffer_blocks"]))
            total_score = (
                remaining_total * 1000
                + deadline_risk * 20
                + (1 - cognitive_fit) * 120
                + load_variance * 0.02
                + context_switches * 5
                + fragmentation_score * 30
            )
            return {
                "id": strategy,
                "label": label,
                "plan_patch": blocks,
                "unscheduled_tasks": unscheduled,
                "validation": validation,
                "metrics": {
                    "scheduled_minutes": scheduled_minutes,
                    "remaining_minutes": remaining_total,
                    "session_count": len(task_sessions),
                    "load_spread_minutes": load_spread,
                    "daily_load_variance": round(load_variance, 2),
                    "daily_peak_minutes": max(day_loads),
                    "deadline_risk_minutes": deadline_risk,
                    "cognitive_fit_score": round(cognitive_fit, 3),
                    "context_switch_count": context_switches,
                    "fragmentation_score": round(fragmentation_score, 3),
                    "buffer_preserved_minutes": buffer_preserved,
                    "total_score": round(total_score, 2),
                    "hard_violation_count": len(validation["violations"]),
                },
            }

        raw_candidates = [
            generate_candidate("energy_fit", "Energy fit"),
            generate_candidate("deadline_first", "Deadline first"),
            generate_candidate("balanced", "Balanced load"),
        ]
        def relabel_candidate(candidate: dict[str, Any], candidate_id: str, label: str) -> dict[str, Any]:
            return {**candidate, "id": candidate_id, "label": label, "origin_strategy": candidate.get("id")}

        energy_source = min(raw_candidates, key=lambda candidate: (
            candidate["metrics"]["hard_violation_count"],
            candidate["metrics"]["remaining_minutes"],
            -candidate["metrics"]["cognitive_fit_score"],
            0 if candidate["id"] == "energy_fit" else 1,
        ))
        deadline_source = min(raw_candidates, key=lambda candidate: (
            candidate["metrics"]["hard_violation_count"],
            candidate["metrics"]["remaining_minutes"],
            candidate["metrics"]["deadline_risk_minutes"],
            0 if candidate["id"] == "deadline_first" else 1,
            candidate["metrics"]["total_score"],
        ))
        balanced_source = min(raw_candidates, key=lambda candidate: (
            candidate["metrics"]["hard_violation_count"],
            candidate["metrics"]["remaining_minutes"],
            candidate["metrics"]["daily_load_variance"],
            candidate["metrics"]["daily_peak_minutes"],
            0 if candidate["id"] == "balanced" else 1,
        ))
        candidate_plans = [
            relabel_candidate(energy_source, "energy_fit", "Energy fit"),
            relabel_candidate(deadline_source, "deadline_first", "Deadline first"),
            relabel_candidate(balanced_source, "balanced", "Balanced load"),
        ]
        candidate_plans.sort(
            key=lambda candidate: (
                candidate["metrics"]["hard_violation_count"],
                candidate["metrics"]["remaining_minutes"],
                candidate["metrics"]["total_score"],
            )
        )
        unique_candidate_plans: list[dict[str, Any]] = []
        seen_plan_signatures: set[tuple] = set()
        for candidate in candidate_plans:
            signature = tuple(sorted(
                (
                    str(block.get("task_id")),
                    int(block.get("day_index", -1)),
                    round(float(block.get("start", 0)), 2),
                    round(float(block.get("end", 0)), 2),
                )
                for block in candidate.get("plan_patch", [])
            ))
            if signature in seen_plan_signatures:
                continue
            seen_plan_signatures.add(signature)
            unique_candidate_plans.append(candidate)
        candidate_plans = unique_candidate_plans
        selected_candidate = candidate_plans[0]
        context["default_assumptions"] = default_deadline_assumptions
        unscheduled_tasks = selected_candidate["unscheduled_tasks"]
        repair_suggestions: list[dict[str, Any]] = []
        for item in unscheduled_tasks:
            task = next((candidate for candidate in ready_tasks if candidate.get("id") == item.get("task_id")), {})
            repair_suggestions.append({
                "task_id": item.get("task_id"),
                "title": task.get("title") or "Task",
                "remaining_minutes": item.get("remaining_minutes", 0),
                "options": [
                    "Add another available window before the deadline.",
                    "Extend the deadline and generate new candidate plans.",
                    "Reduce this week's scope or move the remaining work to next week.",
                    "Reduce buffer only after user confirmation, without occupying fixed events.",
                ],
            })

        joint_state = {
            "task_environment_state": {
                "weekly_context": profile.get("weekly_context", {}),
                "parsed_constraints": context,
                "ready_task_ids": [task.get("id") for task in ready_tasks],
                "blocked_task_ids": [task.get("id") for task in blocked_tasks],
                "needs_clarification": needs_clarification,
                "ai_task_analysis": ai_analysis,
            },
            "user_state": {
                "momentary_state": runtime_state,
                "capacity_score": round(max(0.0, min(1.0, (0.40 * energy + 0.35 * focus + 0.25 * (8 - stress)) / 7.0)), 3),
                "capacity_scope": "today_first_task_only",
                "capacity_evidence": [f"focus={focus}/7", f"energy={energy}/7", f"stress={stress}/7"],
                "relevant_static_profile": {
                    "deep_work_window": profile.get("deep_work_window"),
                    "low_energy_window": profile.get("low_energy_window"),
                    "preferred_session_minutes": preferred_session_minutes,
                    "rest_between_tasks_minutes": rest_minutes,
                },
                "learned_patterns": profile.get("learned_patterns", []),
            },
        }

        candidate_actions = [
            {
                "action": "accept_feasible_candidate",
                "predicted_next_state": "All scheduled sessions remain inside available windows and outside fixed constraints.",
                "fit": "high" if not unscheduled_tasks else "medium",
                "uncertainty": "low" if not unscheduled_tasks else "medium",
            },
            {
                "action": "repair_partial_schedule",
                "predicted_next_state": "Keep feasible sessions and adjust availability, scope, or deadlines for the remaining work.",
                "fit": "high" if unscheduled_tasks else "low",
                "uncertainty": "medium",
            },
        ]

        return {
            "plan_patch": selected_candidate["plan_patch"],
            "candidate_plans": candidate_plans,
            "validation": selected_candidate["validation"],
            "joint_state": joint_state,
            "candidate_actions": candidate_actions,
            "parallel_suggestions": [],
            "constraint_summary": context,
            "unscheduled_tasks": unscheduled_tasks,
            "repair_suggestions": repair_suggestions,
            "low_confidence_demand": low_confidence_demand,
        }

    return node


def explanation_node(store: Any):
    def node(state: HumanOSState) -> HumanOSState:
        profile = state.get("profile", {})
        runtime_state = state.get("runtime_state", {})
        memories = state.get("memories", [])
        explanation = "The weekly structure uses Weekly Context, long-term rhythm, and task demand. Your current state only adjusts today's first session."
        reasons = [
            f"profile={profile.get('role')}, deep_work={profile.get('deep_work_window')}",
            (
                f"today-only state focus={runtime_state.get('focus')}, "
                f"energy={runtime_state.get('energy')}, stress={runtime_state.get('stress')}"
            ),
        ]
        if memories:
            reasons.append(f"retrieved {len(memories)} personalized memories")
        return {"explanation": explanation, "reasons": reasons}

    return node


def confirmation_policy_node(_: Any):
    def node(state: HumanOSState) -> HumanOSState:
        runtime_state = state.get("runtime_state", {})
        candidate_actions = state.get("candidate_actions", [])
        selected_action = max(candidate_actions, key=lambda item: {"low": 0, "medium": 1, "high": 2}.get(item.get("fit"), 0)) if candidate_actions else {}
        state_confidence = runtime_state.get("confidence_level", "high" if runtime_state.get("source") == "self_report" else "medium")
        impact = "high" if selected_action.get("action") in {"rest", "switch_to_lighter_task"} else "low"
        ask_user_before_adjustment = impact == "high" or state_confidence == "low"
        requires_confirmation = True  # every generated plan remains user-editable and user-confirmed
        decision = {
            "action": "suggest_plan",
            "selected_adjustment": selected_action,
            "candidate_actions": candidate_actions,
            "plan_patch": state.get("plan_patch", []),
            "candidate_plans": state.get("candidate_plans", []),
            "selected_candidate_id": (state.get("candidate_plans") or [{}])[0].get("id"),
            "validation": state.get("validation", {}),
            "explanation": state.get("explanation", ""),
            "confidence": {
                "level": state_confidence,
                "evidence": ["available windows", "fixed events", "temporary constraints", "deadlines", "buffer", "task demand", "momentary state scoped to today's first task"],
                "missing_or_conflicting": state.get("joint_state", {}).get("task_environment_state", {}).get("needs_clarification", []),
                "mental_state_is_hypothesis": True,
            },
            "requires_confirmation": requires_confirmation,
            "ask_user_before_adjustment": ask_user_before_adjustment,
            "control_mode": "ai_proposed_user_editable",
            "joint_state": state.get("joint_state", {}),
            "parallel_suggestions": state.get("parallel_suggestions", []),
            "constraint_summary": state.get("constraint_summary", {}),
            "unscheduled_tasks": state.get("unscheduled_tasks", []),
            "repair_suggestions": state.get("repair_suggestions", []),
            "low_confidence_demand": state.get("low_confidence_demand", []),
            "ai_task_analysis": state.get("ai_task_analysis", {}),
            "memory_evidence": state.get("memories", []),
            "reasons": state.get("reasons", []),
            "orchestration": "langgraph",
        }
        return {
            "confidence": state_confidence,
            "requires_confirmation": requires_confirmation,
            "decision": decision,
        }

    return node


def llm_refinement_node(store: Any):
    def node(state: HumanOSState) -> HumanOSState:
        decision = state.get("decision", {})
        refined = store.refine_schedule_decision(state, decision)
        return {"decision": refined}

    return node


def run_schedule_graph(store: Any, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    initial_state: HumanOSState = {"user_id": user_id, "payload": payload}

    try:
        from langgraph.graph import END, START, StateGraph

        builder = StateGraph(HumanOSState)
        builder.add_node("load_profile", load_profile_node(store))
        builder.add_node("load_task_state", load_task_state_node(store))
        builder.add_node("retrieve_memory", retrieve_memory_node(store))
        builder.add_node("analyze_inputs", analyze_inputs_node(store))
        builder.add_node("schedule", scheduler_node(store))
        builder.add_node("explain", explanation_node(store))
        builder.add_node("confirmation_policy", confirmation_policy_node(store))
        builder.add_node("llm_refine", llm_refinement_node(store))
        builder.add_edge(START, "load_profile")
        builder.add_edge("load_profile", "load_task_state")
        builder.add_edge("load_task_state", "retrieve_memory")
        builder.add_edge("retrieve_memory", "analyze_inputs")
        builder.add_edge("analyze_inputs", "schedule")
        builder.add_edge("schedule", "explain")
        builder.add_edge("explain", "confirmation_policy")
        builder.add_edge("confirmation_policy", "llm_refine")
        builder.add_edge("llm_refine", END)
        graph = builder.compile()
        result = graph.invoke(initial_state)
        decision = result["decision"]
        decision["orchestration"] = "langgraph"
        return decision
    except ImportError:
        state: HumanOSState = initial_state
        for node_factory in (
            load_profile_node,
            load_task_state_node,
            retrieve_memory_node,
            analyze_inputs_node,
            scheduler_node,
            explanation_node,
            confirmation_policy_node,
            llm_refinement_node,
        ):
            state.update(node_factory(store)(state))
        decision = state["decision"]
        decision["orchestration"] = "sequential_fallback"
        return decision
