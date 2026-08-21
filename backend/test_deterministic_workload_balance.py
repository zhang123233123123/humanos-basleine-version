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

    def test_runtime_state_only_annotates_todays_next_session(self) -> None:
        result = build_deterministic_plan(
            profile=self.profile(),
            tasks=[{
                "id": "demanding",
                "title": "Demanding task",
                "type": "flexible_task",
                "duration": 90,
                "priority": "high",
                "status": "queued",
                "due": "周三 18:00",
            }],
            analysis={"task_demands": [{"task_id": "demanding", "level": "high"}]},
            payload={
                "week_id": "2026-08-03",
                "rebuild_from_scratch": True,
                "runtime_state": {"focus": 2, "energy": 3, "stress": 6},
            },
        )
        sessions = [item for item in result["plan_patch"] if item.get("kind") == "task_session"]
        self.assertEqual("risky", sessions[0]["scheduling_policy"]["fit"])
        self.assertTrue(all(item["scheduling_policy"]["fit"] == "not_assessed" for item in sessions[1:]))
        self.assertEqual("human_capacity_soft_v1", result["scheduler"]["policy_version"])

    def test_paused_task_with_remaining_work_stays_schedulable(self) -> None:
        result = build_deterministic_plan(
            profile=self.profile(),
            tasks=[{
                "id": "paused-work",
                "title": "Resume analysis",
                "task_type": "recovery_task",
                "duration": 90,
                "status": "paused",
                "priority": "high",
                "due": "周三 18:00",
                "execution": {"remaining_duration_minutes": 45},
            }],
            payload={"week_id": "2026-08-03", "rebuild_from_scratch": True},
        )
        sessions = [item for item in result["plan_patch"] if item.get("task_id") == "paused-work"]
        self.assertEqual(45, sum(int(item["planned_work_minutes"]) for item in sessions))
        self.assertEqual([], result["unscheduled_tasks"])

    def test_hard_dependency_cycle_is_reported_and_not_scheduled(self) -> None:
        tasks = [
            {"id": "a", "title": "A", "task_type": "flexible_task", "duration": 45, "status": "queued", "due": "周三 18:00"},
            {"id": "b", "title": "B", "task_type": "flexible_task", "duration": 45, "status": "queued", "due": "周三 18:00"},
            {"id": "c", "title": "C", "task_type": "flexible_task", "duration": 45, "status": "queued", "due": "周三 18:00"},
        ]
        analysis = {"dependencies": [
            {"before_task_id": "a", "after_task_id": "b", "hard_enforced": True},
            {"before_task_id": "b", "after_task_id": "a", "hard_enforced": True},
            {"before_task_id": "b", "after_task_id": "c", "hard_enforced": True},
        ]}
        result = build_deterministic_plan(
            profile=self.profile(), tasks=tasks, analysis=analysis,
            payload={"week_id": "2026-08-03", "rebuild_from_scratch": True},
        )
        self.assertEqual([], [item for item in result["plan_patch"] if item.get("kind") == "task_session"])
        reasons = {item["task_id"]: item["reason"] for item in result["unscheduled_tasks"]}
        self.assertEqual({"a": "hard_dependency_cycle", "b": "hard_dependency_cycle", "c": "hard_dependency_unsatisfied"}, reasons)

    def test_soft_dependency_does_not_override_earlier_deadline(self) -> None:
        result = build_deterministic_plan(
            profile=self.profile(),
            tasks=[
                {"id": "later", "title": "Later", "task_type": "flexible_task", "duration": 45, "status": "queued", "priority": "medium", "due": "周三 18:00"},
                {"id": "urgent", "title": "Urgent", "task_type": "flexible_task", "duration": 45, "status": "queued", "priority": "medium", "due": "周一 18:00"},
            ],
            analysis={"dependencies": [{
                "before_task_id": "later", "after_task_id": "urgent",
                "hard_enforced": False, "confidence_level": "medium",
            }]},
            payload={"week_id": "2026-08-03", "rebuild_from_scratch": True},
        )
        sessions = [item for item in result["plan_patch"] if item.get("kind") == "task_session"]
        self.assertEqual("urgent", sessions[0]["task_id"])


if __name__ == "__main__":
    unittest.main()
