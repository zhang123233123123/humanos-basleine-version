import unittest

from backend.app.domain.task import project_confirmed_task_schedule


class TaskScheduleProjectionTests(unittest.TestCase):
    def test_split_sessions_are_projected_with_remaining_capacity(self):
        task = {"duration": 120, "execution": {"remaining_duration_minutes": 120}}
        sessions = [
            {"start_at": "2026-08-12T09:00:00+08:00", "end_at": "2026-08-12T09:45:00+08:00", "start": 9, "end": 9.75, "day_index": 2, "planned_work_minutes": 45},
            {"start_at": "2026-08-12T10:00:00+08:00", "end_at": "2026-08-12T10:45:00+08:00", "start": 10, "end": 10.75, "day_index": 2, "planned_work_minutes": 45},
        ]
        result = project_confirmed_task_schedule(task, sessions=sessions, week_id="2026-08-10", revision=3)
        self.assertEqual(result.status, "partially_scheduled")
        self.assertEqual(result.execution["unallocated_schedule_minutes"], 30)
        self.assertEqual(result.slot["sessions"][1]["session_index"], 2)

    def test_task_without_blocks_returns_to_queue(self):
        task = {"duration": 45, "execution": {"remaining_duration_minutes": 45}}
        result = project_confirmed_task_schedule(task, sessions=[], week_id="2026-08-10", revision=3)
        self.assertEqual(result.status, "queued")
        self.assertIsNone(result.slot)


if __name__ == "__main__":
    unittest.main()
