import unittest
import tempfile
from pathlib import Path

from backend.app.domain.planning import apply_parallel_overlap
from backend.humanos_server import Store


class ParallelPlanTransformationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.plan = [
            {"block_id": "a", "task_id": "task-a", "kind": "task_session", "day_index": 0, "start": 9.0, "end": 10.0, "session_minutes": 60, "planned_work_minutes": 60},
            {"block_id": "b", "task_id": "task-b", "kind": "task_session", "day_index": 1, "start": 14.0, "end": 14.75, "session_minutes": 45, "planned_work_minutes": 45},
        ]
        self.suggestion = {
            "primary_block_id": "a", "secondary_block_id": "b",
            "primary_task_id": "task-a", "secondary_task_id": "task-b",
            "parallel_group_id": "g", "day_index": 0, "start": 9.0,
            "suggested_overlap_minutes": 30,
        }

    def test_partial_overlap_preserves_each_tasks_total_work(self) -> None:
        result = apply_parallel_overlap(self.plan, self.suggestion)
        totals = {
            task_id: sum(block["planned_work_minutes"] for block in result if block["task_id"] == task_id)
            for task_id in ("task-a", "task-b")
        }
        self.assertEqual({"task-a": 60, "task-b": 45}, totals)
        parallel = [block for block in result if block.get("parallel_group_id") == "g"]
        self.assertEqual(2, len(parallel))
        remainder = next(block for block in result if block["block_id"] == "b")
        self.assertEqual((15, 15, 14.25), (remainder["session_minutes"], remainder["planned_work_minutes"], remainder["end"]))

    def test_full_guest_overlap_does_not_create_zero_length_remainder(self) -> None:
        plan = [self.plan[0], {**self.plan[1], "end": 14.5, "session_minutes": 30, "planned_work_minutes": 30}]
        result = apply_parallel_overlap(plan, self.suggestion)
        self.assertEqual(2, len(result))
        guest = next(block for block in result if block["task_id"] == "task-b")
        self.assertEqual((0, 9.0, 9.5), (guest["day_index"], guest["start"], guest["end"]))

    def test_overlap_cannot_exceed_planned_work(self) -> None:
        plan = [self.plan[0], {**self.plan[1], "planned_work_minutes": 20}]
        with self.assertRaises(ValueError):
            apply_parallel_overlap(plan, self.suggestion)

    def test_accepting_partial_overlap_persists_a_valid_work_conserving_draft(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "parallel-accept.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Shanghai", "active_week_id": "2026-08-17",
                "weekly_context": {"week_id": "2026-08-17", "weekly_available_windows": "周一至周五 08:00-21:00", "keep_buffer": False},
            })
            store.create_task("u", {"id": "task-a", "title": "洗衣", "due": "周五 18:00", "duration": 60, "priority": "低", "resource_modality": ["motor"], "attention_mode": "intermittent"})
            store.create_task("u", {"id": "task-b", "title": "听播客", "due": "周五 18:00", "duration": 45, "priority": "低", "resource_modality": ["auditory", "verbal"], "attention_mode": "continuous"})
            suggestion = {**self.suggestion, "id": "suggestion", "status": "pending", "resource_basis": ["motor", "auditory", "verbal"]}
            draft = store.save_proposed_plan("u", {
                "plan_patch": self.plan,
                "task_ids": ["task-a", "task-b"],
                "unscheduled_tasks": [],
                "parallel_suggestions": [suggestion],
                "ai_task_analysis": {"task_resource_profiles": [
                    {"task_id": "task-a", "resource_modality": ["motor"], "attention_mode": "intermittent"},
                    {"task_id": "task-b", "resource_modality": ["auditory", "verbal"], "attention_mode": "continuous"},
                ]},
            }, {"week_id": "2026-08-17", "request_id": "partial-overlap"})
            accepted = store.decide_parallel_suggestion("u", {"plan_id": draft["plan_id"], "suggestion_id": "suggestion", "action": "combine"})

        self.assertTrue(accepted["validation"]["valid"], accepted["validation"]["violations"])
        totals = {
            task_id: sum(block["planned_work_minutes"] for block in accepted["plan_patch"] if block["task_id"] == task_id)
            for task_id in ("task-a", "task-b")
        }
        self.assertEqual({"task-a": 60, "task-b": 45}, totals)


if __name__ == "__main__":
    unittest.main()
