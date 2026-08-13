import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.domain.execution import analyze_remaining_work_impact, build_interruption_snapshot, interruption_policy, settle_interruption


class ExecutionInterruptionDomainTests(unittest.TestCase):
    def test_interruption_actions_define_required_context(self) -> None:
        self.assertTrue(interruption_policy("short_break").preserves_session)
        self.assertFalse(interruption_policy("short_break").requires_context_dump)
        self.assertTrue(interruption_policy("continue_later").requires_context_dump)
        self.assertTrue(interruption_policy("switch_task").requires_context_dump)
        self.assertTrue(interruption_policy("help_decide").requires_runtime_state)

    def test_interruption_snapshot_preserves_execution_identity(self) -> None:
        snapshot = build_interruption_snapshot(task_id="task-1", execution_session_id="exec-1", plan_revision=4, actual_minutes=18, remaining_minutes=27, action="switch_task", progress="Outline done", next_step="Draft intro")
        self.assertEqual(("task-1", "exec-1", 4), (snapshot["task_id"], snapshot["execution_session_id"], snapshot["plan_revision"]))
        self.assertEqual((18, 27, "switch_task"), (snapshot["actual_minutes"], snapshot["remaining_minutes"], snapshot["action"]))

    def test_unknown_interruption_action_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            interruption_policy("push_everything_back")

    def test_pause_settles_new_work_once(self) -> None:
        result = settle_interruption(planned_session_minutes=45, previous_active_minutes=10, elapsed_segment_minutes=18, reported_active_minutes=28, previous_task_remaining_minutes=170)
        self.assertEqual(28, result.effective_active_minutes)
        self.assertEqual(17, result.session_remaining_minutes)
        self.assertEqual(152, result.task_remaining_minutes)

    def test_week_capacity_shortage_requires_explicit_choice(self) -> None:
        current = datetime(2026, 8, 16, 23, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
        result = analyze_remaining_work_impact(current=current, remaining_minutes=120, future_sessions=[], current_session_id="exec-1", week_end_at="2026-08-17T00:00:00+08:00")
        self.assertEqual("insufficient", result["capacity_status"])
        self.assertIn("insufficient_capacity_in_week", result["reason_codes"])
        self.assertIn("extend_deadline", result["options"])
        self.assertIn("add_available_time", result["options"])

    def test_resume_conflict_identifies_only_affected_future_sessions(self) -> None:
        current = datetime(2026, 8, 12, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        result = analyze_remaining_work_impact(current=current, remaining_minutes=90, current_session_id="current", future_sessions=[
            {"execution_session_id": "next", "task_id": "b", "planned_start_at": "2026-08-12T11:00:00+08:00", "planned_end_at": "2026-08-12T11:45:00+08:00"},
            {"execution_session_id": "later", "task_id": "c", "planned_start_at": "2026-08-12T15:00:00+08:00", "planned_end_at": "2026-08-12T15:45:00+08:00"},
        ])
        self.assertEqual(["next"], [item["execution_session_id"] for item in result["affected_sessions"]])


if __name__ == "__main__":
    unittest.main()
