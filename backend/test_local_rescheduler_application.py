import unittest

from backend.app.application.local_rescheduler import assess_local_reschedule


class LocalReschedulerApplicationTests(unittest.TestCase):
    def test_session_slack_absorbs_short_break(self) -> None:
        result = assess_local_reschedule(impact={"affected_sessions": [{"execution_session_id": "next"}]}, change_minutes=10, session_slack_minutes=15)
        self.assertTrue(result["absorbed_without_calendar_change"])
        self.assertFalse(result["calendar_diff_required"])

    def test_absorption_uses_slack_gap_then_buffer(self) -> None:
        result = assess_local_reschedule(impact={}, change_minutes=20, session_slack_minutes=5, idle_gap_minutes=5, buffer_minutes=10)
        self.assertEqual(["session_slack", "idle_gap", "buffer"], [item["source"] for item in result["absorbed"]])
        self.assertEqual(0, result["unabsorbed_minutes"])

    def test_conflict_releases_only_affected_flexible_sessions(self) -> None:
        result = assess_local_reschedule(impact={"affected_sessions": [
            {"execution_session_id": "flex", "fixed_event": False},
            {"execution_session_id": "meeting", "fixed_event": True},
        ], "reason_codes": ["overlaps_future_sessions"], "capacity_status": "conflict"}, change_minutes=30)
        self.assertTrue(result["calendar_diff_required"])
        self.assertEqual(["flex"], result["releasable_execution_session_ids"])
        self.assertFalse(result["formal_calendar_changed"])

    def test_no_conflict_does_not_create_diff(self) -> None:
        result = assess_local_reschedule(impact={"affected_sessions": [], "capacity_status": "fits"}, change_minutes=20)
        self.assertFalse(result["calendar_diff_required"])


if __name__ == "__main__":
    unittest.main()
