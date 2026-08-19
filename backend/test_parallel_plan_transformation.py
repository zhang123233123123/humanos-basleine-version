import unittest
import tempfile
from pathlib import Path

from backend.app.domain.planning import apply_parallel_overlap, validate_parallel_decision_action
from backend.app.domain.personalization import EvidenceScope, ProfileTrait
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

    def test_parallel_decision_action_is_an_explicit_closed_contract(self) -> None:
        self.assertEqual("combine", validate_parallel_decision_action("combine"))
        self.assertEqual("keep_separate", validate_parallel_decision_action("keep_separate"))
        for invalid in (None, "", "reject", "COMBINE", 1):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "action must be one of"):
                validate_parallel_decision_action(invalid)

    def test_invalid_action_is_rejected_before_plan_lookup(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "parallel-invalid-action.db")
            with self.assertRaisesRegex(ValueError, "action must be one of"):
                store.decide_parallel_suggestion("u", {
                    "plan_id": "missing-plan",
                    "suggestion_id": "missing-suggestion",
                    "action": "reject",
                })

    def test_accepting_partial_overlap_persists_a_valid_work_conserving_draft(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "parallel-accept.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Shanghai", "active_week_id": "2026-08-17",
                "weekly_context": {"week_id": "2026-08-17", "weekly_available_windows": "周一至周五 08:00-21:00", "keep_buffer": False},
            })
            store.create_task("u", {"id": "task-a", "title": "洗衣", "due": "周五 18:00", "duration": 60, "priority": "低", "resource_modality": ["motor"], "attention_mode": "intermittent", "parallelizable": True})
            store.create_task("u", {"id": "task-b", "title": "听播客", "due": "周五 18:00", "duration": 45, "priority": "低", "resource_modality": ["auditory", "verbal"], "attention_mode": "continuous", "parallelizable": True})
            suggestion = {**self.suggestion, "id": "suggestion", "status": "pending", "resource_basis": ["motor", "auditory", "verbal"]}
            draft = store.save_proposed_plan("u", {
                "plan_patch": self.plan,
                "task_ids": ["task-a", "task-b"],
                "unscheduled_tasks": [],
                "parallel_suggestions": [suggestion],
                "ai_task_analysis": {"task_resource_profiles": [
                    {"task_id": "task-a", "resource_modality": ["motor"], "attention_mode": "intermittent", "parallelizable": True},
                    {"task_id": "task-b", "resource_modality": ["auditory", "verbal"], "attention_mode": "continuous", "parallelizable": True},
                ]},
            }, {"week_id": "2026-08-17", "request_id": "partial-overlap"})
            accepted = store.decide_parallel_suggestion("u", {"plan_id": draft["plan_id"], "suggestion_id": "suggestion", "action": "combine"})

        self.assertTrue(accepted["validation"]["valid"], accepted["validation"]["violations"])
        totals = {
            task_id: sum(block["planned_work_minutes"] for block in accepted["plan_patch"] if block["task_id"] == task_id)
            for task_id in ("task-a", "task-b")
        }
        self.assertEqual({"task-a": 60, "task-b": 45}, totals)

    def test_confirmed_parallel_sessions_derive_actual_overlap_for_feedback(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "parallel-attribution.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Shanghai", "active_week_id": "2026-08-17",
                "weekly_context": {"week_id": "2026-08-17", "weekly_available_windows": "周一 08:00-12:00", "keep_buffer": False},
            })
            store.create_task("u", {"id": "task-a", "title": "洗衣", "week_id": "2026-08-17", "due": "周五 18:00", "duration": 30, "priority": "低", "resource_modality": ["motor"], "attention_mode": "intermittent", "parallelizable": True})
            store.create_task("u", {"id": "task-b", "title": "听播客", "week_id": "2026-08-17", "due": "周五 18:00", "duration": 30, "priority": "低", "resource_modality": ["auditory"], "attention_mode": "continuous", "parallelizable": True})
            trait = ProfileTrait(
                trait_id="trait-1", user_id="u", trait_key="perceived_state.energy",
                value={"field": "energy", "band": "high", "daypart": "morning"},
                scope=EvidenceScope(temporal_context={"daypart": "morning", "timezone": "Asia/Shanghai"}),
                evidence_ids=("e1",), confidence_level="medium", user_confirmed=True,
                confirmed_at=1_700_000_000_000, updated_at=1_700_000_000_000,
            )
            with store.connect() as conn:
                conn.execute("INSERT INTO profile_traits (id,user_id,candidate_id,trait_key,trait_json,status,confirmed_at,updated_at) VALUES (?,?,?,?,?,'confirmed',?,?)", (trait.trait_id, "u", "candidate-1", trait.trait_key, trait.model_dump_json(), trait.confirmed_at, trait.updated_at))
            plan_patch = [
                {"block_id": "a", "task_id": "task-a", "kind": "task_session", "day_index": 0, "start": 9.0, "end": 9.5, "session_minutes": 30, "planned_work_minutes": 30, "parallel_group_id": "g", "parallel_user_confirmed": True, "parallel_task_ids": ["task-a", "task-b"], "allowed_overlap_minutes": 30, "parallel_role": "primary", "applied_profile_trait_ids": ["trait-1"]},
                {"block_id": "b", "task_id": "task-b", "kind": "task_session", "day_index": 0, "start": 9.0, "end": 9.5, "session_minutes": 30, "planned_work_minutes": 30, "parallel_group_id": "g", "parallel_user_confirmed": True, "parallel_task_ids": ["task-a", "task-b"], "allowed_overlap_minutes": 30, "parallel_role": "secondary"},
            ]
            draft = store.save_proposed_plan("u", {"plan_patch": plan_patch, "task_ids": ["task-a", "task-b"], "unscheduled_tasks": []}, {"week_id": "2026-08-17", "request_id": "parallel-draft"})
            store.confirm_plan("u", {"plan_id": draft["plan_id"], "week_id": "2026-08-17", "edit_episode_id": draft["edit_episode_id"], "plan_patch": plan_patch, "unscheduled_tasks": [], "accepted_parallel_pairs": [{"parallel_group_id": "g", "primary_task_id": "task-a", "secondary_task_id": "task-b", "suggested_overlap_minutes": 30}]})
            sessions = {item["task_id"]: item for item in store.list_execution_sessions("u")}
            self.assertTrue(sessions["task-a"]["parallel_context"]["planned_parallel"])
            self.assertEqual(["task-b"], sessions["task-a"]["parallel_context"]["partner_task_ids"])
            start = "2026-08-17T09:00:00+08:00"
            end = "2026-08-17T09:30:00+08:00"
            for task_id in ("task-a", "task-b"):
                store.start_execution_session("u", {"execution_session_id": sessions[task_id]["execution_session_id"], "actual_start_at": start, "request_id": f"start-{task_id}"})
            for task_id in ("task-a", "task-b"):
                store.end_execution_session("u", {"execution_session_id": sessions[task_id]["execution_session_id"], "actual_end_at": end, "actual_minutes": 30, "request_id": f"end-{task_id}"})
            feedback = store.save_execution_feedback("u", {"task_id": "task-a", "execution_session_id": sessions["task-a"]["execution_session_id"], "request_id": "parallel-feedback", "task_evaluation": {"completion": "completed", "actual_minutes": 30}})
            effects = store.profile_trait_effects("u")

        self.assertEqual("parallel", feedback["execution_context"]["attribution"])
        self.assertTrue(feedback["execution_context"]["actual_parallel"])
        self.assertEqual(30, feedback["execution_context"]["observed_overlap_minutes"])
        self.assertEqual([sessions["task-b"]["execution_session_id"]], feedback["execution_context"]["partner_session_ids"])
        self.assertEqual(0, effects[0]["usage_with_feedback_count"])
        self.assertEqual(1, effects[0]["attribution"]["parallel_count"])
        self.assertEqual("insufficient_data", effects[0]["assessment"])


if __name__ == "__main__":
    unittest.main()
