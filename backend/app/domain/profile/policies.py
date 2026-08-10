"""Pure construction and update policies for the Profile aggregate."""

from __future__ import annotations

from typing import Any

from .models import ProfileAggregate
from .weekly import sanitize_weekly_context


def build_default_profile(user_id: str, *, timezone_name: str, week_of: str) -> ProfileAggregate:
    return ProfileAggregate(
        user_id=user_id,
        role="硕士生",
        deep_work_window="09:00-11:30",
        low_energy_window="14:00-15:30",
        control_preference="ai_proposed_user_editable",
        timezone=timezone_name,
        blocker_patterns=["task_ambiguity", "fatigue", "context_loss"],
        weekly_context={
            "week_of": week_of,
            "weekly_available_windows": "",
            "fixed_events": [],
            "context_items": [],
            "weekly_goal": "",
            "temporary_constraints": [],
            "other_commitments": [],
            "weekly_note": "",
            "keep_buffer": True,
            "buffer_preference": "保留可调整时间与无任务时段",
        },
        learned_patterns=[],
        research_context={
            "planning_tools": [],
            "primary_planning_tool": None,
            "planning_tool_use_frequency": None,
            "source": "user_self_report",
            "captured_at": None,
            "revision": 0,
        },
        task_preferences={
            "writing": "morning_deep_work",
            "admin": "low_energy_slots",
            "reading": "moderate_energy",
            "onboarding_completed": False,
            "planning_gap": "",
            "common_blockers": [],
            "preferred_session_minutes": 45,
            "rest_between_tasks_minutes": 15,
            "day_rhythm": {
                "morning_energy": 6,
                "afternoon_energy": 4,
                "evening_energy": 5,
            },
            "learning_mode": "reading_writing",
            "current_courses": "",
            "near_deadlines": "",
            "short_term_goal": "",
            "support_need": "clarify_next_action",
        },
    )


def merge_profile_patch(
    current: dict[str, Any] | None,
    patch: dict[str, Any],
    *,
    captured_at: str,
) -> ProfileAggregate:
    current = dict(current or {})
    user_id = str(patch.get("user_id") or current.get("user_id") or "demo")
    current_research = dict(current.get("research_context") or {})
    incoming_research = patch.get("research_context")
    research_changed = incoming_research is not None and dict(incoming_research or {}) != current_research
    research_revision = int(current.get("research_context_revision") or current_research.get("revision") or 0)
    if research_changed:
        research_revision += 1
    research_context = dict(incoming_research if incoming_research is not None else current_research)
    research_context.setdefault("planning_tools", [])
    research_context.setdefault("primary_planning_tool", None)
    research_context.setdefault("planning_tool_use_frequency", None)
    research_context["source"] = "user_self_report"
    research_context["revision"] = research_revision
    if research_changed:
        research_context["captured_at"] = captured_at

    def value(name: str, fallback: Any) -> Any:
        return patch[name] if name in patch else current.get(name, fallback)

    return ProfileAggregate(
        user_id=user_id,
        role=value("role", "研究型学生"),
        deep_work_window=value("deep_work_window", "09:00-11:30"),
        low_energy_window=value("low_energy_window", "14:00-15:30"),
        control_preference=value("control_preference", "ai_proposed_user_editable"),
        blocker_patterns=value("blocker_patterns", []),
        task_preferences=value("task_preferences", {}),
        weekly_context=sanitize_weekly_context(value("weekly_context", {})),
        learned_patterns=value("learned_patterns", []),
        timezone=value("timezone", "Asia/Shanghai"),
        active_week_id=value("active_week_id", None),
        active_plan_revision=value("active_plan_revision", None),
        last_daily_checkin_date=value("last_daily_checkin_date", None),
        research_context=research_context,
        research_context_revision=research_revision,
    )
