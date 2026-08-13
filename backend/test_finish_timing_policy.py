import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from backend.humanos_server import Store


class FinishTimingPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.tmp.name) / "humanos.db")
        self.user_id = "finish-policy-user"
        current = datetime.now(ZoneInfo("Asia/Shanghai")).replace(second=0, microsecond=0)
        week_start = (current - timedelta(days=current.weekday())).replace(hour=8, minute=0)
        self.now = week_start
        self.week_id = week_start.date().isoformat()
        self.store.upsert_profile({
            "user_id": self.user_id,
            "timezone": "Asia/Shanghai",
            "role": "student",
            "deep_work_window": "09:00-11:30",
            "weekly_context": {
                "week_id": self.week_id,
                "context_items": [],
                "keep_buffer": False,
                "weekly_available_windows": "Monday-Sunday 00:00-23:45",
            },
        })
        self.first_task = self.store.create_task(self.user_id, {
            "title": "System implementation",
            "due": "Sunday 23:00",
            "duration": 45,
            "priority": "high",
            "week_id": self.week_id,
        })
        self.next_task = self.store.create_task(self.user_id, {
            "title": "Review findings",
            "due": "Sunday 23:00",
            "duration": 45,
            "priority": "medium",
            "week_id": self.week_id,
        })
        first_start = self.now + timedelta(minutes=15)
        first_end = first_start + timedelta(minutes=45)
        next_start = first_end + timedelta(minutes=15)
        next_end = next_start + timedelta(minutes=45)
        self.first_end = first_end
        self.patch = [
            {
                "block_id": "finish-block-1",
                "task_id": self.first_task["id"],
                "day_index": first_start.weekday(),
                "start": first_start.hour + first_start.minute / 60,
                "end": first_end.hour + first_end.minute / 60,
                "session_minutes": 45,
                "planned_work_minutes": 45,
                "start_at": first_start.isoformat(),
                "end_at": first_end.isoformat(),
            },
            {
                "block_id": "finish-block-2",
                "task_id": self.next_task["id"],
                "day_index": next_start.weekday(),
                "start": next_start.hour + next_start.minute / 60,
                "end": next_end.hour + next_end.minute / 60,
                "session_minutes": 45,
                "planned_work_minutes": 45,
                "start_at": next_start.isoformat(),
                "end_at": next_end.isoformat(),
            },
        ]
        proposal = self.store.save_proposed_plan(
            self.user_id,
            {"plan_patch": self.patch},
            {"week_id": self.week_id, "request_id": "finish-policy-proposal"},
        )
        self.confirmed_plan = self.store.confirm_plan(self.user_id, {
            "plan_id": proposal["plan_id"],
            "plan_revision": proposal["plan_revision"],
            "week_id": self.week_id,
            "plan_patch": self.patch,
            "unscheduled_tasks": [],
            "ai_task_analysis": {},
            "decision": proposal,
        })["plan"]

    def tearDown(self):
        self.tmp.cleanup()

    def _finish_first(self, actual_end_at: datetime, request_suffix: str):
        session = self.store.list_execution_sessions(self.user_id, ["ready"])[0]
        started = self.store.start_execution_session(self.user_id, {
            "execution_session_id": session["execution_session_id"],
            "request_id": f"start-{request_suffix}",
        })
        ended = self.store.end_execution_session(self.user_id, {
            "execution_session_id": started["execution_session_id"],
            "actual_end_at": actual_end_at.isoformat(),
            "actual_minutes": 45,
            "request_id": f"end-{request_suffix}",
        })
        return ended

    def test_early_finish_records_feedback_without_replanning(self):
        ended = self._finish_first(self.first_end - timedelta(minutes=10), "early")
        feedback = self.store.save_execution_feedback(self.user_id, {
            "task_id": self.first_task["id"],
            "execution_session_id": ended["execution_session_id"],
            "request_id": "feedback-early",
            "trigger": "session_finished",
            "task_evaluation": {"completion": "completed", "actual_minutes": 45},
            "schedule_action": "keep_time_free",
        })
        self.assertEqual("on_time_or_early", ended["timing_outcome"])
        self.assertFalse(feedback["execution_failure_recorded"])
        self.assertFalse(feedback["requires_plan_adjustment"])
        self.assertFalse(feedback["replan"]["required"])
        self.assertEqual(self.confirmed_plan["plan_revision"], self.store.active_plan(self.user_id)["plan_revision"])

    def test_small_finish_delay_stays_within_tolerance(self):
        ended = self._finish_first(self.first_end + timedelta(minutes=5), "small-delay")
        self.assertEqual("late_within_tolerance", ended["timing_outcome"])
        self.assertEqual(5, ended["overrun_minutes"])
        self.assertFalse(ended["overrun_failure"])

    def test_late_finish_records_failure_and_queues_local_replan(self):
        ended = self._finish_first(self.first_end + timedelta(minutes=20), "late")
        with patch.object(self.store, "start_background_job"):
            feedback = self.store.save_execution_feedback(self.user_id, {
                "task_id": self.first_task["id"],
                "execution_session_id": ended["execution_session_id"],
                "request_id": "feedback-late",
                "trigger": "session_finished",
                "task_evaluation": {"completion": "completed", "actual_minutes": 45},
                "schedule_action": "keep_time_free",
            })
        self.assertEqual("overrun_failure", ended["timing_outcome"])
        self.assertEqual(20, ended["overrun_minutes"])
        self.assertTrue(feedback["execution_failure_recorded"])
        self.assertTrue(feedback["requires_plan_adjustment"])
        self.assertTrue(feedback["replan"]["required"])
        self.assertEqual("execution_overrun", feedback["replan"]["trigger"])
        self.assertIn(self.next_task["id"], feedback["replan"]["affected_task_ids"])
        self.assertEqual("queued", feedback["replan"]["job"]["status"])
        # A generated revision is only a draft. The confirmed plan remains the
        # execution source until the user applies the local calendar diff.
        self.assertEqual(self.confirmed_plan["plan_revision"], self.store.active_plan(self.user_id)["plan_revision"])
        with self.store.connect() as conn:
            event_types = [row[0] for row in conn.execute(
                "SELECT type FROM events WHERE user_id=? ORDER BY created_at",
                (self.user_id,),
            ).fetchall()]
        self.assertIn("execution_overrun_failed", event_types)
        self.assertIn("execution_overrun_replan_requested", event_types)


if __name__ == "__main__":
    unittest.main()
