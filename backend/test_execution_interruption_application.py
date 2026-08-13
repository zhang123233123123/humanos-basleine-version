import unittest

from backend.app.application.execution_interruption import build_interruption_command, interruption_response


class ExecutionInterruptionApplicationTests(unittest.TestCase):
    def test_legacy_pause_defaults_to_continue_later(self) -> None:
        command = build_interruption_command({"execution_session_id": "exec-1"})
        self.assertEqual("continue_later", command["interruption_action"])
        self.assertTrue(command["interruption_policy"]["requires_context_dump"])

    def test_short_break_defers_calendar_change(self) -> None:
        command = build_interruption_command({"interruption_action": "short_break"})
        result = interruption_response(execution_session={"execution_session_id": "exec-1"}, command=command, impact=None)
        self.assertEqual("break_timer", result["interruption"]["next_stage"])
        self.assertFalse(result["interruption"]["formal_calendar_changed"])
        self.assertTrue(result["pause_review"]["deferred"])

    def test_switch_task_routes_to_ready_queue_after_context(self) -> None:
        command = build_interruption_command({"interruption_action": "switch_task"})
        result = interruption_response(execution_session={}, command=command, impact={"requires_plan_adjustment": True})
        self.assertEqual("capture_context_and_ready_queue", result["interruption"]["next_stage"])
        self.assertTrue(result["interruption"]["context_required"])


if __name__ == "__main__":
    unittest.main()
