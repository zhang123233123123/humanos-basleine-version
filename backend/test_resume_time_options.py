import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.application.resume_time_options import evaluate_resume_time


class ResumeTimeOptionsTests(unittest.TestCase):
    def test_conflict_returns_available_alternative(self) -> None:
        timezone = ZoneInfo("Asia/Shanghai")
        result = evaluate_resume_time(
            preferred=datetime.fromisoformat("2026-08-13T10:00:00+08:00"),
            duration_minutes=30,
            week_id="2026-08-10",
            available_windows=[{"day_index": 3, "start": 9, "end": 12}],
            occupied_sessions=[{"execution_session_id": "busy", "task_id": "other", "planned_start_at": "2026-08-13T10:00:00+08:00", "planned_end_at": "2026-08-13T10:30:00+08:00"}],
            timezone=timezone,
        )
        self.assertFalse(result["valid"])
        self.assertEqual("session_overlap", result["conflicts"][0]["type"])
        self.assertEqual("2026-08-13T10:30:00+08:00", result["alternatives"][0])

    def test_time_inside_empty_window_is_valid(self) -> None:
        timezone = ZoneInfo("Asia/Shanghai")
        result = evaluate_resume_time(preferred=datetime.fromisoformat("2026-08-13T09:00:00+08:00"), duration_minutes=45, week_id="2026-08-10", available_windows=[{"day_index": 3, "start": 9, "end": 12}], occupied_sessions=[], timezone=timezone)
        self.assertTrue(result["valid"])


if __name__ == "__main__":
    unittest.main()
