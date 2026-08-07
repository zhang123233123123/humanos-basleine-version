"""Run seven days of confirmed-plan execution without changing system time.

The simulator uses explicit ISO timestamps accepted by the production Store
methods. One real second therefore represents any amount of simulated time.
It writes a human-readable and JSON report under qa-artifacts/.
"""

from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.humanos_server import Store


TZ = ZoneInfo("Asia/Shanghai")


def iso(moment: datetime) -> str:
    return moment.replace(tzinfo=TZ).isoformat()


def simulate_week(db_path: Path) -> dict:
    user_id = "accelerated-week-user"
    week_start = datetime(2026, 8, 3, 0, 0)
    next_week = "2026-08-10"
    store = Store(db_path)
    store.upsert_profile({
        "user_id": user_id,
        "timezone": "Asia/Shanghai",
        "role": "student",
        "deep_work_window": "09:00-11:30",
        "active_week_id": "2026-08-03",
        "weekly_context": {
            "week_id": "2026-08-03",
            "available_windows": [
                {"day_index": day, "start": 8.0, "end": 18.0}
                for day in range(7)
            ],
            "context_items": [{
                "id": "lunch",
                "type": "recurring_routine",
                "title": "Lunch",
                "occurrence_mode": "repeat_every_day",
                "start": 12.0,
                "end": 13.0,
            }],
            "keep_buffer": True,
        },
    })

    task_specs = [
        ("Review research notes", 60),
        ("Code interview transcripts", 60),
        ("Revise literature review", 60),
        ("Prepare findings diagram", 45),
        ("Write findings section", 60),
        ("Format references", 45),
        ("Prepare weekly reflection", 30),
    ]
    tasks = []
    blocks = []
    for day_index, (title, duration) in enumerate(task_specs):
        task = store.create_task(user_id, {
            "title": title,
            "due": f"{(week_start + timedelta(days=day_index)).date().isoformat()} 18:00",
            "duration": duration,
            "priority": "high" if day_index < 5 else "medium",
            "expected_difficulty": 5 if day_index < 5 else 3,
        })
        tasks.append(task)
        start = week_start + timedelta(days=day_index, hours=9)
        end = start + timedelta(minutes=duration)
        blocks.append({
            "block_id": f"week-block-{day_index + 1}",
            "task_id": task["id"],
            "day_index": day_index,
            "start": 9.0,
            "end": 9.0 + duration / 60,
            "session_minutes": duration,
            "planned_work_minutes": duration,
            "start_at": iso(start),
            "end_at": iso(end),
        })

    proposal = store.save_proposed_plan(
        user_id,
        {"plan_patch": blocks, "explanation": "Accelerated seven-day QA plan"},
        {"week_id": "2026-08-03", "request_id": "accelerated-week-proposal"},
    )
    confirmed = store.confirm_plan(user_id, {
        "plan_id": proposal["plan_id"],
        "plan_revision": proposal["plan_revision"],
        "week_id": "2026-08-03",
        "plan_patch": blocks,
        "unscheduled_tasks": [],
        "ai_task_analysis": {},
        "decision": proposal,
    })["plan"]
    sessions = {item["task_id"]: item for item in store.list_execution_sessions(user_id)}

    outcomes = [
        ("completed", 60),
        ("completed", 55),
        ("partial", 35),
        ("not_started", 0),
        ("completed", 60),
        ("completed", 45),
        ("completed", 30),
    ]
    daily_results = []
    for day_index, (task, (outcome, actual_minutes)) in enumerate(zip(tasks, outcomes)):
        day = week_start + timedelta(days=day_index)
        local_date = day.strftime("%Y-%m-%d")
        store.save_runtime_state(user_id, {
            "focus": max(3, 7 - day_index // 2),
            "energy": max(3, 6 - day_index // 3),
            "stress": min(6, 3 + day_index // 2),
            "mood": "okay",
            "daily_checkin": True,
            "local_date": local_date,
        })
        session = sessions[task["id"]]
        start = day + timedelta(hours=9)
        started = store.start_execution_session(user_id, {
            "execution_session_id": session["execution_session_id"],
            "actual_start_at": iso(start),
            "request_id": f"day-{day_index + 1}-start",
        })
        interruption = None
        if day_index == 1:
            paused_at = start + timedelta(minutes=20)
            paused = store.pause_execution_session(user_id, {
                "execution_session_id": started["execution_session_id"],
                "paused_at": iso(paused_at),
                "actual_minutes": 20,
                "request_id": "day-2-pause",
            })
            context = store.save_context_dump(user_id, {
                "task_id": task["id"],
                "progress": "Coded the first transcript section",
                "next_action": "Continue from participant quote 12",
                "stop_reason": "interrupted",
                "remaining_duration_minutes": 40,
            })
            resumed_at = start + timedelta(minutes=35)
            store.start_execution_session(user_id, {
                "execution_session_id": started["execution_session_id"],
                "actual_start_at": iso(resumed_at),
                "request_id": "day-2-resume",
            })
            interruption = {
                "paused_minutes": paused["accumulated_active_minutes"],
                "next_action": context["next_action"],
                "resumed_same_session": True,
            }
        ended_at = start + timedelta(minutes=max(actual_minutes, 1) + (15 if day_index == 1 else 0))
        ended = store.end_execution_session(user_id, {
            "execution_session_id": started["execution_session_id"],
            "actual_end_at": iso(ended_at),
            "actual_minutes": actual_minutes,
            "request_id": f"day-{day_index + 1}-finish",
        })
        # Replay the finish request to verify that accelerated UI retries do
        # not create a second state transition.
        replay = store.end_execution_session(user_id, {
            "execution_session_id": started["execution_session_id"],
            "actual_end_at": iso(ended_at),
            "actual_minutes": actual_minutes,
            "request_id": f"day-{day_index + 1}-finish",
        })
        feedback = store.save_execution_feedback(user_id, {
            "task_id": task["id"],
            "execution_session_id": started["execution_session_id"],
            "request_id": f"day-{day_index + 1}-feedback",
            "trigger": "accelerated_week_qa",
            "task_evaluation": {
                "completion": outcome,
                "actual_minutes": actual_minutes,
                "perceived_difficulty": 4,
            },
            "state_evaluation": {"focus_after": 4, "energy_after": 4},
            "recommendation_evaluation": {"fit": "acceptable"},
        })
        # Feedback replay must also be idempotent.
        replay_feedback = store.save_execution_feedback(user_id, {
            "task_id": task["id"],
            "execution_session_id": started["execution_session_id"],
            "request_id": f"day-{day_index + 1}-feedback",
            "task_evaluation": {"completion": outcome, "actual_minutes": actual_minutes},
            "state_evaluation": {},
            "recommendation_evaluation": {},
        })
        current_task = store.get_task(task["id"], user_id)
        current_session = next(
            item for item in store.list_execution_sessions(user_id)
            if item["execution_session_id"] == started["execution_session_id"]
        )
        daily_results.append({
            "day": day.strftime("%A"),
            "task": task["title"],
            "outcome": outcome,
            "actual_minutes": actual_minutes,
            "remaining_minutes": current_task["execution"]["remaining_duration_minutes"],
            "task_status": current_task["status"],
            "session_status": current_session["status"],
            "finish_idempotent": ended["execution_session_id"] == replay["execution_session_id"],
            "feedback_idempotent": feedback["id"] == replay_feedback["id"],
            "interruption": interruption,
        })

    unfinished = [
        task for task in store.list_tasks(user_id)
        if task["status"] not in {"completed", "terminated"}
        and int((task.get("execution") or {}).get("remaining_duration_minutes") or 0) > 0
    ]
    carry_ids = [task["id"] for task in unfinished]
    rollover = store.rollover_week(user_id, {
        "week_id": next_week,
        "use_last_week": True,
        "carry_task_ids": carry_ids,
    })
    carried = [
        task for task in rollover["tasks"]
        if task["id"] in carry_ids and task["week_id"] == next_week and not task["removed_from_week"]
    ]
    with store.connect() as conn:
        feedback_count = conn.execute(
            "SELECT COUNT(*) FROM execution_feedback WHERE user_id=?", (user_id,)
        ).fetchone()[0]
        request_count = conn.execute(
            "SELECT COUNT(*) FROM execution_requests WHERE user_id=?", (user_id,)
        ).fetchone()[0]
        context_dump_count = conn.execute(
            "SELECT COUNT(*) FROM context_dumps WHERE user_id=?", (user_id,)
        ).fetchone()[0]
        checkin_count = conn.execute(
            "SELECT COUNT(*) FROM runtime_states WHERE user_id=?", (user_id,)
        ).fetchone()[0]

    assert len(daily_results) == 7
    assert feedback_count == 7
    assert checkin_count == 7
    assert context_dump_count == 1
    assert all(day["finish_idempotent"] and day["feedback_idempotent"] for day in daily_results)
    assert daily_results[2]["remaining_minutes"] == 25
    assert daily_results[2]["task_status"] == "queued"
    assert daily_results[3]["remaining_minutes"] == 45
    assert daily_results[3]["task_status"] == "queued"
    assert daily_results[1]["interruption"]["resumed_same_session"]
    assert len(carried) == 2
    assert store.active_plan(user_id, "2026-08-03") is None

    return {
        "simulation": "7 days accelerated in one process",
        "week_id": "2026-08-03",
        "confirmed_plan_id": confirmed["plan_id"],
        "daily_results": daily_results,
        "totals": {
            "days": 7,
            "daily_checkins": checkin_count,
            "feedback_records": feedback_count,
            "context_dumps": context_dump_count,
            "idempotent_action_records": request_count,
            "completed_tasks": sum(day["task_status"] == "completed" for day in daily_results),
            "unfinished_tasks": len(unfinished),
        },
        "rollover": {
            "new_week_id": next_week,
            "carried_task_titles": [task["title"] for task in carried],
            "old_plan_superseded": store.active_plan(user_id, "2026-08-03") is None,
            "routine_reused": len(rollover["profile"]["weekly_context"]["context_items"]) == 1,
            "daily_checkin_reset": rollover["profile"].get("last_daily_checkin_date") is None,
        },
    }


def write_reports(report: dict, artifact_dir: Path) -> tuple[Path, Path]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    json_path = artifact_dir / "accelerated-week-report.json"
    md_path = artifact_dir / "accelerated-week-report.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# HumanOS accelerated week simulation",
        "",
        f"- Simulation: {report['simulation']}",
        f"- Week: {report['week_id']}",
        f"- Daily check-ins: {report['totals']['daily_checkins']}",
        f"- Feedback records: {report['totals']['feedback_records']}",
        f"- Completed tasks: {report['totals']['completed_tasks']}",
        f"- Tasks carried to next week: {report['totals']['unfinished_tasks']}",
        "",
        "| Day | Task | Result | Actual | Remaining | Task state | Interruption |",
        "|---|---|---:|---:|---:|---|---|",
    ]
    for day in report["daily_results"]:
        lines.append(
            f"| {day['day']} | {day['task']} | {day['outcome']} | "
            f"{day['actual_minutes']} min | {day['remaining_minutes']} min | "
            f"{day['task_status']} | {'pause/resume' if day['interruption'] else '—'} |"
        )
    lines.extend([
        "",
        "## Week rollover",
        "",
        f"- New week: {report['rollover']['new_week_id']}",
        f"- Carried: {', '.join(report['rollover']['carried_task_titles'])}",
        f"- Old plan superseded: {report['rollover']['old_plan_superseded']}",
        f"- Repeating routine reused: {report['rollover']['routine_reused']}",
        f"- Daily check-in reset: {report['rollover']['daily_checkin_reset']}",
    ])
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, md_path


def main() -> None:
    artifact_dir = ROOT / "qa-artifacts"
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
        report = simulate_week(Path(temp_dir) / "accelerated-week.db")
    json_path, md_path = write_reports(report, artifact_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"JSON report: {json_path}")
    print(f"Markdown report: {md_path}")


if __name__ == "__main__":
    main()
