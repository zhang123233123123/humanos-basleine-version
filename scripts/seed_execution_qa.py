import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.humanos_server import Store


db_path = Path(os.environ["HUMANOS_DB_PATH"])
if db_path.exists():
    db_path.unlink()
store = Store(db_path)
user = store.create_user("execution-qa@example.com", "testing123", "Execution QA")
user_id = user["user"]["id"]
now = datetime.now(ZoneInfo("Asia/Shanghai"))
week_start = (now - timedelta(days=now.weekday())).date().isoformat()
store.upsert_profile({
    "user_id": user_id,
    "timezone": "Asia/Shanghai",
    "role": "student",
    "deep_work_window": "09:00-11:30",
    "low_energy_window": "14:00-15:30",
    "task_preferences": {"onboarding_completed": True, "preferred_session_minutes": 45, "preferred_break_minutes": 15},
    "weekly_context": {"week_id": week_start, "context_items": [], "keep_buffer": True},
})
first = store.create_task(user_id, {"title": "Analyze interview transcripts", "due": "Sunday 18:00", "duration": 120, "priority": "high", "expected_difficulty": 6})
second = store.create_task(user_id, {"title": "Prepare findings diagram", "due": "Sunday 18:00", "duration": 45, "priority": "medium", "expected_difficulty": 4})
quarter = ((now.minute // 15) + 1) * 15
start = now.hour + quarter / 60
if quarter >= 60:
    start = now.hour + 1
start = min(max(start, 8.0), 19.0)
blocks = [
    {"block_id": "qa-block-1", "task_id": first["id"], "day_index": now.weekday(), "start": start, "end": start + .75, "session_minutes": 45, "planned_work_minutes": 45},
    {"block_id": "qa-block-2", "task_id": second["id"], "day_index": now.weekday(), "start": start + 1.0, "end": start + 1.75, "session_minutes": 45, "planned_work_minutes": 45},
]
proposal = store.save_proposed_plan(user_id, {"plan_patch": blocks}, {"week_id": week_start, "request_id": "execution-qa-proposal"})
store.confirm_plan(user_id, {"plan_id": proposal["plan_id"], "plan_revision": proposal["plan_revision"], "week_id": week_start, "plan_patch": blocks, "unscheduled_tasks": [], "ai_task_analysis": {}, "decision": proposal})
print(user_id)
