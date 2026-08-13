import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.application.execution_impact import assess_execution_impact


class ExecutionImpactApplicationTests(unittest.TestCase):
    def test_real_buffer_absorbs_change_before_calendar_diff(self) -> None:
        result = assess_execution_impact(current=datetime(2026, 8, 13, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai")), session={"execution_session_id": "current", "week_id": "2026-08-10", "plan_revision": 2}, task={}, future_sessions=[], active_plan={"week_id": "2026-08-10", "weekly_timeline": {"intervals": [{"id": "buffer", "kind": "rest_buffer", "week_start_minute": 5100, "week_end_minute": 5130}]}}, action="short_break", remaining_minutes=30, change_minutes=10)
        self.assertTrue(result["reschedule_check"]["absorbed_without_calendar_change"])
        self.assertEqual(30, result["capacity_projection"]["buffer_minutes"])

    def test_fixed_event_is_not_releasable(self) -> None:
        result = assess_execution_impact(current=datetime(2026, 8, 13, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai")), session={"execution_session_id": "current", "week_id": "2026-08-10", "plan_revision": 2}, task={}, future_sessions=[{"execution_session_id": "meeting-session", "block_id": "meeting", "task_id": "fixed", "planned_start_at": "2026-08-13T10:15:00+08:00", "planned_end_at": "2026-08-13T11:00:00+08:00"}], active_plan={"week_id": "2026-08-10", "weekly_timeline": {"intervals": [{"id": "meeting", "kind": "fixed_event", "week_start_minute": 4935, "week_end_minute": 4980}]}}, action="resume", remaining_minutes=60)
        self.assertEqual([], result["reschedule_check"]["releasable_execution_session_ids"])
        self.assertTrue(result["affected_sessions"][0]["fixed_event"])


if __name__ == "__main__":
    unittest.main()
