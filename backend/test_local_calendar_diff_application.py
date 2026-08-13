import unittest

from backend.app.application.local_calendar_diff import apply_local_calendar_diff, build_local_calendar_diff


class LocalCalendarDiffApplicationTests(unittest.TestCase):
    def test_diff_does_not_change_formal_calendar(self) -> None:
        diff = build_local_calendar_diff(plan_id="plan-1", plan_revision=3, week_id="2026-08-10", execution_session={"execution_session_id": "exec-1", "task_id": "task-1", "block_id": "block-1", "planned_start_at": "2026-08-13T09:00:00+08:00", "planned_end_at": "2026-08-13T09:45:00+08:00", "remaining_at_pause": 30}, preferred_resume_at="2026-08-13T19:00:00+08:00")
        self.assertFalse(diff["formal_calendar_changed"])
        self.assertTrue(diff["confirmation_required"])
        self.assertEqual("2026-08-13T19:30:00+08:00", diff["changes"][0]["after"]["end_at"])

    def test_projection_changes_only_target_block(self) -> None:
        diff = build_local_calendar_diff(plan_id="plan-1", plan_revision=3, week_id="2026-08-10", execution_session={"execution_session_id": "exec-1", "task_id": "task-1", "block_id": "block-1", "remaining_at_pause": 30}, preferred_resume_at="2026-08-13T19:00:00+08:00", affected_session_ids=["exec-2"])
        projected = apply_local_calendar_diff([{"block_id": "block-1", "start_at": "old"}, {"block_id": "block-2", "start_at": "unchanged"}], diff)
        self.assertEqual("2026-08-13T19:00:00+08:00", projected[0]["start_at"])
        self.assertEqual("unchanged", projected[1]["start_at"])
        self.assertEqual(["exec-2"], diff["affected_execution_session_ids"])


if __name__ == "__main__":
    unittest.main()
