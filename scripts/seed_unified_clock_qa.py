"""Seed the deterministic browser QA week used by qa_unified_clock_week.mjs."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.humanos_server import Store


DB_PATH = Path(os.environ["HUMANOS_DB_PATH"])
ARTIFACTS = ROOT / "qa-artifacts"
USER_EMAIL = "clock-qa@example.com"
PASSWORD = "testing123"
WEEK_ID = "2026-08-03"


def block(block_id: str, task_id: str, day: int, start: float, end: float) -> dict:
    minutes = round((end - start) * 60)
    return {
        "block_id": block_id,
        "task_id": task_id,
        "day_index": day,
        "start": start,
        "end": end,
        "session_minutes": minutes,
        "planned_work_minutes": minutes,
    }


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    store = Store(DB_PATH)
    created = store.create_user(USER_EMAIL, PASSWORD, "Unified Clock QA")
    user_id = created["user"]["id"]

    context_items = [
        {
            "id": "ctx-lunch",
            "type": "recurring_routine",
            "title": "Lunch",
            "days": list(range(7)),
            "start": 12.0,
            "end": 13.0,
            "occurrence_mode": "repeat_every_day",
            "shift_minutes": 0,
            "confirmed": True,
        },
        {
            "id": "ctx-meeting",
            "type": "fixed_event",
            "title": "Research meeting",
            "days": [1],
            "start": 10.5,
            "end": 11.5,
            "confirmed": True,
        },
        {
            "id": "ctx-out",
            "type": "temporary_constraint",
            "title": "Out of office",
            "days": [3],
            "start": 14.0,
            "end": 17.0,
            "confirmed": True,
        },
        {
            "id": "ctx-laundry",
            "type": "flexible_activity",
            "title": "Laundry",
            "days": [3],
            "start": 17.0,
            "end": 18.0,
            "duration_minutes": 40,
            "occurrence_mode": "once_this_week",
            "confirmed": True,
            "parallel_session": {
                "day_index": 3,
                "start": 17.0,
                "end": 17.5,
                "parallel_group_id": "parallel-laundry-podcast",
                "parallel_context_ids": ["ctx-laundry", "ctx-podcast"],
                "allowed_overlap_minutes": 30,
                "user_confirmed": True,
            },
        },
        {
            "id": "ctx-podcast",
            "type": "flexible_activity",
            "title": "English podcast",
            "days": [3],
            "start": 17.0,
            "end": 18.0,
            "duration_minutes": 30,
            "occurrence_mode": "once_this_week",
            "confirmed": True,
            "parallel_session": {
                "day_index": 3,
                "start": 17.0,
                "end": 17.5,
                "parallel_group_id": "parallel-laundry-podcast",
                "parallel_context_ids": ["ctx-laundry", "ctx-podcast"],
                "allowed_overlap_minutes": 30,
                "user_confirmed": True,
            },
        },
    ]
    store.upsert_profile({
        "user_id": user_id,
        "timezone": "Asia/Singapore",
        "role": "student",
        "deep_work_window": "09:00-11:30",
        "low_energy_window": "14:00-15:30",
        "task_preferences": {
            "onboarding_completed": True,
            "preferred_session_minutes": 45,
            "rest_between_tasks_minutes": 15,
        },
        "research_context": {
            "planning_tools": [
                {"tool_type": "digital_calendar", "tool_name": "Google Calendar", "frequency": "daily", "reliance": 5},
                {"tool_type": "task_manager", "tool_name": "Notion", "frequency": "weekly", "reliance": 3},
            ]
        },
        "active_week_id": WEEK_ID,
        "weekly_context": {
            "week_id": WEEK_ID,
            "week_of": WEEK_ID,
            "available_windows": [
                *[{"day_index": day, "start": 8.0, "end": 18.0} for day in range(5)],
                {"day_index": 5, "start": 9.0, "end": 13.0},
            ],
            "weekly_available_windows": "Monday-Friday 08:00-18:00; Saturday 09:00-13:00",
            "context_items": context_items,
            "keep_buffer": True,
            "weekly_goal": "Complete a stable implementation and experiment design.",
        },
    })

    task_specs = [
        ("T1", "System implementation", "2026-08-07 18:00", 180, "high", 6, "queued"),
        ("T2", "Experiment design", "2026-08-08 12:00", 120, "high", 6, "queued"),
        ("T3", "Literature review", "2026-08-06 18:00", 90, "medium", 4, "queued"),
        ("T4", "Email supervisor", "2026-08-04 17:00", 30, "medium", 2, "queued"),
        ("T5", "Analyze pilot data", "2026-08-07 18:00", 90, "high", 6, "blocked"),
    ]
    tasks = {}
    for task_id, title, due, duration, priority, difficulty, status in task_specs:
        tasks[task_id] = store.create_task(user_id, {
            "id": task_id,
            "title": title,
            "due": due,
            "duration": duration,
            "priority": priority,
            "expected_difficulty": difficulty,
            "status": status,
            "week_id": WEEK_ID,
            "context": "Deterministic unified-clock QA fixture.",
        })

    plan_patch = [
        block("T1-MON-1", "T1", 0, 9.0, 9.75),
        block("T1-MON-2", "T1", 0, 10.0, 10.75),
        block("T1-WED-1", "T1", 2, 9.0, 9.75),
        block("T1-FRI-1", "T1", 4, 9.0, 9.75),
        block("T2-WED-1", "T2", 2, 10.0, 10.75),
        block("T2-THU-1", "T2", 3, 9.0, 9.75),
        block("T2-SAT-1", "T2", 5, 9.0, 9.5),
        block("T3-MON-1", "T3", 0, 11.0, 11.75),
        block("T3-WED-1", "T3", 2, 14.0, 14.75),
        block("T4-TUE-1", "T4", 1, 9.0, 9.5),
    ]
    decision = {
        "plan_patch": plan_patch,
        "explanation": "High-demand work uses deep-work windows; fixed time, lunch, out-of-office time, and buffer remain protected.",
        "user_reason": "System implementation starts in the first high-focus window.",
        "planner_source": "deterministic_browser_qa_fixture",
        "parallel_suggestions": [{
            "id": "parallel-laundry-podcast",
            "status": "accepted",
            "primary_context_id": "ctx-laundry",
            "secondary_context_id": "ctx-podcast",
            "suggested_overlap_minutes": 30,
            "confidence_level": "high",
            "evidence": ["Laundry is manual/physical while the podcast is low-demand auditory input."],
        }],
    }
    proposal = store.save_proposed_plan(user_id, decision, {"week_id": WEEK_ID, "request_id": "unified-clock-plan-v1"})
    confirmed = store.confirm_plan(user_id, {
        "plan_id": proposal["plan_id"],
        "plan_revision": proposal["plan_revision"],
        "edit_episode_id": proposal["edit_episode_id"],
        "week_id": WEEK_ID,
        "plan_patch": plan_patch,
        "unscheduled_tasks": [],
        "ai_task_analysis": {},
        "decision": proposal,
    })
    output = {
        "user_id": user_id,
        "email": USER_EMAIL,
        "password": PASSWORD,
        "week_id": WEEK_ID,
        "plan_id": confirmed["plan"]["plan_id"],
        "plan_revision": confirmed["plan"]["plan_revision"],
        "task_ids": sorted(tasks),
        "fixture_source": "deterministic; it does not claim a live DeepSeek call",
    }
    (ARTIFACTS / "unified-clock-seed.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output))


if __name__ == "__main__":
    main()
