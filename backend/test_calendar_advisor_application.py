import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.application.calendar_advisor import advisor_requires_planner_handoff, fallback_calendar_summary, sessions_for_local_date


class CalendarAdvisorApplicationTests(unittest.TestCase):
    def test_write_request_is_handed_to_planner(self) -> None:
        self.assertTrue(advisor_requires_planner_handoff("帮我把组会移动到下午两点"))
        self.assertFalse(advisor_requires_planner_handoff("为什么组会安排在下午两点"))

    def test_today_sessions_ignore_superseded(self) -> None:
        current = datetime(2026, 8, 12, 9, tzinfo=ZoneInfo("Asia/Shanghai"))
        sessions = [
            {"task_id": "a", "planned_start_at": "2026-08-12T10:00:00+08:00", "status": "ready"},
            {"task_id": "b", "planned_start_at": "2026-08-12T11:00:00+08:00", "status": "superseded"},
        ]
        result = sessions_for_local_date(sessions, [{"id": "a", "title": "复习"}], current)
        self.assertEqual(["复习"], [item["task_title"] for item in result])
        self.assertIn("今天共有 1 个执行时段", fallback_calendar_summary(result, [], current, "zh"))


if __name__ == "__main__":
    unittest.main()
