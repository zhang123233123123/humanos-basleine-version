import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.application.plan_capacity_projection import annotate_future_sessions, project_plan_capacity, week_minute


class PlanCapacityProjectionTests(unittest.TestCase):
    def test_projects_fixed_events_and_real_buffer(self) -> None:
        capacity = project_plan_capacity({"plan_id": "p", "plan_revision": 2, "week_id": "2026-08-10", "weekly_timeline": {"intervals": [
            {"id": "meeting", "kind": "fixed_event", "week_start_minute": 3600, "week_end_minute": 3660},
            {"id": "buffer", "kind": "rest_buffer", "week_start_minute": 3500, "week_end_minute": 3530},
            {"id": "work", "kind": "task_session", "task_id": "t", "week_start_minute": 3400, "week_end_minute": 3445},
        ]}}, current_week_minute=3300)
        self.assertEqual(["meeting"], capacity["fixed_event_interval_ids"])
        self.assertEqual(30, capacity["buffer_minutes"])

    def test_annotates_matching_execution_block_as_fixed(self) -> None:
        result = annotate_future_sessions([{"execution_session_id": "e", "block_id": "meeting"}], {"fixed_event_interval_ids": ["meeting"]})
        self.assertTrue(result[0]["fixed_event"])

    def test_week_minute_uses_monday_axis(self) -> None:
        current = datetime(2026, 8, 13, 10, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.assertEqual(3 * 1440 + 10 * 60 + 30, week_minute(current, "2026-08-10"))


if __name__ == "__main__":
    unittest.main()
