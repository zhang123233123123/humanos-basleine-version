"""Exercise a complete v1 -> v2 edit episode on the unified-clock QA DB."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.humanos_server import Store


DB_PATH = Path(os.environ["HUMANOS_DB_PATH"])
ARTIFACTS = ROOT / "qa-artifacts"


def work_block(block_id: str, task_id: str, day: int, start: float, end: float, work: int | None = None) -> dict:
    capacity = round((end - start) * 60)
    return {
        "block_id": block_id,
        "task_id": task_id,
        "day_index": day,
        "start": start,
        "end": end,
        "session_minutes": capacity,
        "planned_work_minutes": capacity if work is None else work,
    }


store = Store(DB_PATH)
with store.connect() as conn:
    user_id = conn.execute("SELECT id FROM users WHERE lower(email)=lower(?)", ("clock-qa@example.com",)).fetchone()["id"]

v1 = store.active_plan(user_id, "2026-08-03")
assert v1 and v1["plan_revision"] == 1
original_task = store.get_task("T1", user_id)
store.patch_task("T1", {"due": "2026-08-08 18:00"}, user_id)
assert store.get_task("T1", user_id)["id"] == original_task["id"]
assert store.active_plan(user_id, "2026-08-03")["plan_status"] == "needs_update"

source_block = next(item for item in v1["plan_patch"] if item["block_id"] == "T1-FRI-1")
illegal = {**source_block, "day_index": 3, "start": 14.25, "end": 15.0}
failed = store.record_plan_edit_event(user_id, {
    "edit_episode_id": v1["edit_episode_id"],
    "task_id": "T1",
    "block_id": source_block["block_id"],
    "event_type": "edit_attempt_failed",
    "before": source_block,
    "after": illegal,
    "validation_result": {"valid": False, "violations": [{"type": "hard_constraint_conflict", "constraint": "Out of office"}]},
    "request_id": "qa-illegal-out-of-office",
})
assert not failed["effective"]

legal = {**source_block, "start": 8.0, "end": 8.75}
move = store.record_plan_edit_event(user_id, {
    "edit_episode_id": v1["edit_episode_id"],
    "task_id": "T1",
    "block_id": source_block["block_id"],
    "event_type": "move_session",
    "before": source_block,
    "after": legal,
    "validation_result": {"valid": True, "violations": []},
    "request_id": "qa-legal-move",
})
undo = store.record_plan_edit_event(user_id, {
    "edit_episode_id": v1["edit_episode_id"],
    "task_id": "T1",
    "block_id": source_block["block_id"],
    "event_type": "undo_edit",
    "before": legal,
    "after": source_block,
    "reverts_event_id": move["event_id"],
    "validation_result": {"valid": True},
    "request_id": "qa-undo-move",
})
assert undo["effective"]

remaining = {task["id"]: int((task.get("execution") or {}).get("remaining_duration_minutes") or 0) for task in store.list_tasks(user_id)}
assert remaining["T1"] > 0 and remaining["T2"] > 0 and remaining["T3"] > 0

base_patch = [
    work_block("T3-V2-1", "T3", 3, 10.0, 11.5, remaining["T3"]),
    work_block("T1-V2-1", "T1", 4, 9.0, 9.75, min(45, remaining["T1"])),
    work_block("T1-V2-2", "T1", 4, 10.0, 10.75, min(45, max(remaining["T1"] - 45, 0))),
    work_block("T1-V2-3", "T1", 4, 11.0, 11.5, max(remaining["T1"] - 90, 0)),
    work_block("T2-V2-1", "T2", 4, 13.0, 13.75, min(45, remaining["T2"])),
    work_block("T2-V2-2", "T2", 5, 9.0, 10.25, max(remaining["T2"] - 45, 0)),
]
# Drop zero-work tail blocks if a previous execution outcome reduced the task.
base_patch = [item for item in base_patch if item["planned_work_minutes"] > 0]
decision = {
    "plan_patch": base_patch,
    "explanation": "Revision after a deadline change; Python validates every proposed time.",
    "planner_source": "deterministic_plan_revision_qa",
}
v2_proposed = store.save_proposed_plan(user_id, decision, {"week_id": "2026-08-03", "request_id": "qa-plan-v2"})
final_patch = [dict(item) for item in base_patch]
final_patch[1] = {**final_patch[1], "start": 8.0, "end": 8.75}
store.record_plan_edit_event(user_id, {
    "edit_episode_id": v2_proposed["edit_episode_id"],
    "task_id": final_patch[1]["task_id"],
    "block_id": final_patch[1]["block_id"],
    "event_type": "move_session",
    "before": base_patch[1],
    "after": final_patch[1],
    "validation_result": {"valid": True},
    "request_id": "qa-v2-final-move",
})
confirm_payload = {
    "plan_id": v2_proposed["plan_id"],
    "plan_revision": v2_proposed["plan_revision"],
    "edit_episode_id": v2_proposed["edit_episode_id"],
    "week_id": "2026-08-03",
    "plan_patch": final_patch,
    "unscheduled_tasks": [],
    "ai_task_analysis": {},
    "decision": v2_proposed,
}
pending_reason = store.confirm_plan(user_id, confirm_payload)
assert pending_reason["requires_rationale"]
confirmed = store.confirm_plan(user_id, {
    **confirm_payload,
    "rationale": {
        "reason_codes": ["better_fit_with_energy"],
        "raw_user_response": "The earlier block fits my high-focus period.",
        "response_status": "answered",
        "request_id": "qa-rationale-once",
    },
})
assert confirmed["plan"]["plan_revision"] == 2
assert confirmed["plan"]["plan_status"] == "confirmed"

with store.connect() as conn:
    plans = [dict(row) for row in conn.execute("SELECT id,plan_revision,plan_status FROM plans WHERE user_id=? ORDER BY plan_revision", (user_id,))]
    sessions = [dict(row) for row in conn.execute("SELECT id,task_id,block_id,plan_revision,status,planned_start_at,planned_end_at FROM execution_sessions WHERE user_id=? ORDER BY plan_revision,planned_start_at", (user_id,))]
    events = [dict(row) for row in conn.execute("SELECT * FROM plan_edit_events WHERE user_id=? ORDER BY server_time,sequence_number", (user_id,))]
    rationales = [dict(row) for row in conn.execute("SELECT * FROM plan_change_rationales WHERE user_id=?", (user_id,))]
    episodes = [dict(row) for row in conn.execute("SELECT * FROM plan_edit_episodes WHERE user_id=? ORDER BY started_at", (user_id,))]

assert plans[0]["plan_status"] == "superseded" and plans[-1]["plan_status"] == "confirmed"
assert not [item for item in sessions if item["plan_revision"] == 1 and item["status"] == "ready"]
assert [item for item in sessions if item["plan_revision"] == 2 and item["status"] == "ready"]
assert len(rationales) == 1

plan_diff = json.loads(episodes[-1]["canonical_diff_json"] or "{}")
report = {
    "passed": True,
    "task_id_preserved": store.get_task("T1", user_id)["id"] == "T1",
    "illegal_drag_rejected": not failed["effective"],
    "legal_move_recorded": bool(move["effective"]),
    "undo_recorded": bool(undo["effective"]),
    "rationale_asked_once": len(rationales) == 1,
    "v1_status": plans[0]["plan_status"],
    "v2_status": plans[-1]["plan_status"],
    "old_ready_sessions_retired": not [item for item in sessions if item["plan_revision"] == 1 and item["status"] == "ready"],
    "active_v2_ready_sessions": len([item for item in sessions if item["plan_revision"] == 2 and item["status"] == "ready"]),
}
ARTIFACTS.mkdir(parents=True, exist_ok=True)
(ARTIFACTS / "unified-clock-plan-diff.json").write_text(json.dumps(plan_diff, ensure_ascii=False, indent=2), encoding="utf-8")
(ARTIFACTS / "unified-clock-plan-edit-events.json").write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
(ARTIFACTS / "unified-clock-execution-sessions.json").write_text(json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8")
(ARTIFACTS / "unified-clock-plan-revision-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report))
