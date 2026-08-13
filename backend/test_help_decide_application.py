import unittest

from backend.app.application.help_decide import fallback_recommendation, validate_recommendation


class HelpDecideApplicationTests(unittest.TestCase):
    def test_low_capacity_recommends_timed_break(self) -> None:
        result = fallback_recommendation({"runtime_state": {"focus": 2, "energy": 2, "stress": 6}, "remaining_minutes": 45})
        self.assertEqual("short_break", result["action"])
        self.assertEqual(10, result["break_minutes"])

    def test_blocked_task_switches_to_ready_candidate(self) -> None:
        result = fallback_recommendation({
            "reason": "Waiting for material",
            "runtime_state": {"focus": 5, "energy": 5, "stress": 2},
            "ready_queue": [{"execution_session_id": "exec-2", "task_id": "task-2", "remaining_minutes": 30}],
        })
        self.assertEqual("switch_task", result["action"])
        self.assertEqual("exec-2", result["target_execution_session_id"])

    def test_invalid_switch_target_falls_back_without_inventing_id(self) -> None:
        result = validate_recommendation(
            {"action": "switch_task", "target_execution_session_id": "invented"},
            {"runtime_state": {"focus": 5, "energy": 5, "stress": 2}, "remaining_minutes": 40, "ready_queue": []},
        )
        self.assertEqual("continue_current", result["action"])
        self.assertIn("target_not_in_ready_queue", result["validation"]["violations"])

    def test_invalid_break_duration_is_bounded(self) -> None:
        result = validate_recommendation(
            {"action": "short_break", "break_minutes": 120, "reason": "rest"},
            {"runtime_state": {}, "remaining_minutes": 30, "ready_queue": []},
        )
        self.assertEqual(10, result["break_minutes"])
        self.assertFalse(result["validation"]["valid"])


if __name__ == "__main__":
    unittest.main()
