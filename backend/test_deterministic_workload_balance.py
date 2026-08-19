import unittest

from backend.app.application.deterministic_scheduler import build_deterministic_plan


class DeterministicWorkloadBalanceTests(unittest.TestCase):
    def profile(self) -> dict:
        return {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T07:00:00+08:00",
            "task_preferences": {
                "preferred_session_minutes": 45,
                "rest_between_tasks_minutes": 15,
            },
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "周一 08:00-18:00；周二 08:00-18:00；周三 08:00-18:00",
                "fixed_events": [],
                "temporary_constraints": [],
                "keep_buffer": False,
            },
        }

    def test_sessions_are_distributed_across_equally_eligible_days(self) -> None:
        result = build_deterministic_plan(
            profile=self.profile(),
            tasks=[{
                "id": "long-task",
                "title": "Long task",
                "type": "flexible_task",
                "duration": 135,
                "priority": "high",
                "status": "queued",
                "due": "周三 18:00",
            }],
            payload={"week_id": "2026-08-03", "rebuild_from_scratch": True},
        )

        loads: dict[int, int] = {}
        for block in result["plan_patch"]:
            if block.get("kind") != "task_session":
                continue
            day = int(block["day_index"])
            loads[day] = loads.get(day, 0) + int(block["planned_work_minutes"])

        self.assertEqual({0: 45, 1: 45, 2: 45}, loads)

    def test_earlier_deadline_remains_a_hard_boundary(self) -> None:
        result = build_deterministic_plan(
            profile=self.profile(),
            tasks=[
                {
                    "id": "urgent",
                    "title": "Urgent task",
                    "type": "flexible_task",
                    "duration": 90,
                    "priority": "high",
                    "status": "queued",
                    "due": "周一 18:00",
                },
                {
                    "id": "later",
                    "title": "Later task",
                    "type": "flexible_task",
                    "duration": 90,
                    "priority": "medium",
                    "status": "queued",
                    "due": "周三 18:00",
                },
            ],
            payload={"week_id": "2026-08-03", "rebuild_from_scratch": True},
        )

        urgent_days = {
            int(block["day_index"])
            for block in result["plan_patch"]
            if block.get("task_id") == "urgent"
        }
        later_days = {
            int(block["day_index"])
            for block in result["plan_patch"]
            if block.get("task_id") == "later"
        }
        self.assertEqual({0}, urgent_days)
        self.assertTrue(later_days <= {0, 1, 2})
        self.assertEqual([], result["unscheduled_tasks"])


if __name__ == "__main__":
    unittest.main()
