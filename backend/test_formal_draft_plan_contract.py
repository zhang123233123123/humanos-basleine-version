import unittest

from backend.humanos_graph import scheduler_node


class FormalDraftPlanContractTests(unittest.TestCase):
    def profile(self, windows: str = "周一至周五 08:00-18:00") -> dict:
        return {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T07:00:00+08:00",
            "deep_work_window": "09:00-11:30",
            "low_energy_window": "14:00-15:30",
            "task_preferences": {
                "preferred_session_minutes": 45,
                "rest_between_tasks_minutes": 15,
            },
            "weekly_context": {
                "weekly_available_windows": windows,
                "context_items": [],
                "keep_buffer": True,
            },
        }

    def schedule(self, tasks: list[dict], windows: str = "周一至周五 08:00-18:00") -> dict:
        return scheduler_node(None)({
            "tasks": tasks,
            "profile": self.profile(windows),
            "runtime_state": {"focus": 5, "energy": 4, "stress": 3},
            "ai_task_analysis": {},
        })

    def test_every_remaining_minute_is_planned_or_explicitly_unscheduled(self) -> None:
        tasks = [
            {"id": "analysis", "title": "Analyze interviews", "due": "周三 18:00", "duration": 150, "priority": "高", "status": "queued"},
            {"id": "review", "title": "Revise literature review", "due": "周四 17:00", "duration": 120, "priority": "高", "status": "queued"},
        ]
        result = self.schedule(tasks)
        for task in tasks:
            planned = sum(
                int(block.get("planned_work_minutes") or block.get("session_minutes") or 0)
                for block in result["plan_patch"]
                if block.get("task_id") == task["id"]
            )
            unscheduled = sum(
                int(item.get("remaining_minutes") or 0)
                for item in result["unscheduled_tasks"]
                if item.get("task_id") == task["id"]
            )
            self.assertEqual(task["duration"], planned + unscheduled)

    def test_draft_sessions_use_quarter_hour_grid_and_do_not_overlap(self) -> None:
        tasks = [
            {"id": "a", "title": "Task A", "due": "周五 18:00", "duration": 120, "priority": "高", "status": "queued"},
            {"id": "b", "title": "Task B", "due": "周五 18:00", "duration": 120, "priority": "中", "status": "queued"},
        ]
        result = self.schedule(tasks)
        self.assertTrue(result["validation"]["valid"], result["validation"]["violations"])
        for block in result["plan_patch"]:
            self.assertAlmostEqual(float(block["start"]) * 4, round(float(block["start"]) * 4))
            self.assertAlmostEqual(float(block["end"]) * 4, round(float(block["end"]) * 4))
        for day in range(7):
            blocks = sorted(
                (block for block in result["plan_patch"] if block["day_index"] == day),
                key=lambda block: block["start"],
            )
            for previous, current in zip(blocks, blocks[1:]):
                self.assertGreaterEqual(current["start"], previous["end"])

    def test_work_that_cannot_fit_is_never_silently_dropped(self) -> None:
        result = self.schedule([
            {"id": "large", "title": "Large task", "due": "周一 09:00", "duration": 240, "priority": "高", "status": "queued"},
        ], windows="周一 08:00-09:00")
        unscheduled = next(item for item in result["unscheduled_tasks"] if item["task_id"] == "large")
        self.assertGreater(int(unscheduled["remaining_minutes"]), 0)
        self.assertTrue(unscheduled.get("reason"))


if __name__ == "__main__":
    unittest.main()
