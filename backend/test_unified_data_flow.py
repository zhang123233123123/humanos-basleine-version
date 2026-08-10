import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import backend.humanos_server as hs


class UnifiedDataFlowTests(unittest.TestCase):
    def setUp(self):
        self.old_test_mode = hs.TEST_MODE
        self.old_clock = hs._TEST_CLOCK_BASE
        hs.TEST_MODE = True
        hs._TEST_CLOCK_BASE = datetime.fromisoformat("2026-08-09T08:45:00+08:00")
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = hs.Store(Path(self.tmp.name) / "humanos.db")
        self.profile = self.store.upsert_profile({
            "user_id": "flow-user",
            "timezone": "Asia/Shanghai",
            "role": "student",
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "周一至周日 08:00-21:00",
                "context_items": [],
                "keep_buffer": False,
            },
        })
        reconciled = self.store.reconcile_weekly_setup("flow-user", {
            "week_id": "2026-08-03",
            "profile": self.profile,
            "tasks": [
                {"title": "Analyze interviews", "due": "周日 18:00前完成", "duration": 60, "priority": "高", "expected_difficulty": 6},
                {"title": "Prepare notes", "due": "周日 18:00前完成", "duration": 60, "priority": "中", "expected_difficulty": 3},
            ],
        })
        self.first, self.second = reconciled["active_ready_tasks"][:2]
        self.blocks = [
            {"block_id": "flow-a", "task_id": self.first["id"], "day_index": 6, "start": 9.0, "end": 10.0, "session_minutes": 60, "planned_work_minutes": 60},
            {"block_id": "flow-b", "task_id": self.second["id"], "day_index": 6, "start": 11.0, "end": 12.0, "session_minutes": 60, "planned_work_minutes": 60},
        ]
        proposed = self.store.save_proposed_plan("flow-user", {"plan_patch": self.blocks}, {"week_id": "2026-08-03", "request_id": "initial-flow-plan"})
        self.confirmed = self.store.confirm_plan("flow-user", {
            "plan_id": proposed["plan_id"], "week_id": "2026-08-03", "plan_patch": self.blocks,
            "decision": proposed, "unscheduled_tasks": [], "ai_task_analysis": {},
        })["plan"]

    def tearDown(self):
        hs.TEST_MODE = self.old_test_mode
        hs._TEST_CLOCK_BASE = self.old_clock
        self.tmp.cleanup()

    def revision(self, start=9.25):
        patch = [{**block} for block in self.confirmed["plan_patch"]]
        patch[0].update({"start": start, "end": start + 1, "draft_changed": True})
        return self.store.propose_plan_revision("flow-user", {
            "base_plan_id": self.confirmed["plan_id"], "week_id": "2026-08-03",
            "plan_patch": patch, "source": "confirmed_calendar_drag", "request_id": f"revision-{start}",
        })

    def test_01_plan_edit_creates_structured_episodic_memory(self):
        revision = self.revision()
        event = self.store.record_plan_edit_event("flow-user", {
            "edit_episode_id": revision["edit_episode_id"], "event_type": "move_session",
            "task_id": self.first["id"], "block_id": "flow-a", "before": self.blocks[0],
            "after": revision["plan_patch"][0], "validation_result": {"valid": True},
            "user_explanation": "I focus better later this morning", "request_id": "memory-event",
        })
        memories = self.store.search_memories("flow-user", "focus later morning", 50)
        memory = next(item for item in memories if item["source_id"] == event["event_id"])
        self.assertEqual((event["event_id"], "move_session"), (memory["source_id"], memory["metadata"]["observed_behavior"]))

    def test_02_single_edit_does_not_change_static_profile(self):
        before = list(self.store.get_profile("flow-user").get("learned_patterns") or [])
        revision = self.revision()
        self.store.record_plan_edit_event("flow-user", {"edit_episode_id": revision["edit_episode_id"], "event_type": "move_session", "validation_result": {"valid": True}})
        self.assertEqual(before, self.store.get_profile("flow-user").get("learned_patterns") or [])

    def test_03_failed_edit_is_not_pattern_evidence(self):
        revision = self.revision()
        self.store.record_plan_edit_event("flow-user", {"edit_episode_id": revision["edit_episode_id"], "event_type": "failed_edit_attempt", "validation_result": {"valid": False}, "pattern_label": "morning"})
        self.assertFalse(any(item["pattern_label"] == "morning" for item in self.store.pattern_candidates("flow-user")))

    def test_04_undo_removes_event_from_learning(self):
        revision = self.revision()
        event = self.store.record_plan_edit_event("flow-user", {"edit_episode_id": revision["edit_episode_id"], "event_type": "move_session", "validation_result": {"valid": True}, "pattern_label": "morning"})
        self.store.record_plan_edit_event("flow-user", {"edit_episode_id": revision["edit_episode_id"], "event_type": "undo_edit", "reverts_event_id": event["event_id"], "validation_result": {"valid": True}})
        learned = [item for item in self.store.search_memories("flow-user", "morning", 50) if item["source_type"] == "episodic_memory"]
        self.assertEqual([], learned)

    def test_05_three_eligible_episodes_create_candidate_only(self):
        for index in range(3):
            self.store.add_memory("flow-user", "episodic_memory", f"episode-{index}", self.first["id"], "Demanding work moved to morning", {"pattern_label": "morning_deep_work", "eligible_for_pattern": True, "effective": True})
        candidate = next(item for item in self.store.pattern_candidates("flow-user") if item["pattern_label"] == "morning_deep_work")
        self.assertEqual(("candidate", []), (candidate["status"], self.store.get_profile("flow-user").get("learned_patterns") or []))

    def test_06_user_confirmation_promotes_candidate(self):
        for index in range(3):
            self.store.add_memory("flow-user", "episodic_memory", f"promote-{index}", self.first["id"], "Morning preference", {"pattern_label": "morning_preference", "eligible_for_pattern": True, "effective": True})
        result = self.store.promote_pattern("flow-user", {"pattern_label": "morning_preference", "user_confirmed": True, "evidence_count": 3})
        self.assertTrue(result["learned_patterns"][0]["user_confirmed"])

    def test_07_unconfirmed_pattern_cannot_enter_profile(self):
        with self.assertRaises(ValueError):
            self.store.promote_pattern("flow-user", {"pattern_label": "anything", "user_confirmed": False})

    def test_08_revision_does_not_mutate_task_slot_before_apply(self):
        before = self.store.get_task(self.first["id"], "flow-user")["slot"]["start"]
        self.revision(9.25)
        self.assertEqual(before, self.store.get_task(self.first["id"], "flow-user")["slot"]["start"])

    def test_09_revision_marks_confirmed_plan_needs_update(self):
        revision = self.revision()
        self.assertEqual(("proposed", "needs_update"), (revision["plan_status"], self.store.active_plan("flow-user")["plan_status"]))

    def test_10_apply_synchronizes_plan_task_and_execution(self):
        revision = self.revision(9.25)
        result = self.store.confirm_plan("flow-user", {
            "plan_id": revision["plan_id"], "week_id": "2026-08-03",
            "plan_patch": revision["plan_patch"], "decision": revision,
            "rationale": {
                "reason_codes": ["better_timing"], "raw_user_response": "Fits my morning",
                "generalizability": "only_this_week", "affected_task_ids": [self.first["id"]],
            },
        })
        task = self.store.get_task(self.first["id"], "flow-user")
        execution = next(item for item in self.store.list_execution_sessions("flow-user", ["ready"]) if item["task_id"] == self.first["id"])
        self.assertEqual((9.25, result["plan"]["plan_patch"][0]["start"]), (task["slot"]["start"], result["plan"]["plan_patch"][0]["start"]))
        self.assertIn("09:15", execution["planned_start_at"])

    def test_11_cancel_restores_confirmed_revision(self):
        revision = self.revision()
        restored = self.store.cancel_plan_revision("flow-user", {"plan_id": revision["plan_id"], "base_plan_id": self.confirmed["plan_id"]})["plan"]
        self.assertEqual(("confirmed", self.confirmed["plan_id"]), (restored["plan_status"], restored["plan_id"]))

    def test_12_resume_without_impact_is_direct(self):
        result = self.store.evaluate_local_adjustment("flow-user", {"action": "resume", "task_id": self.first["id"], "remaining_minutes": 60})
        self.assertTrue(result["can_resume_directly"])

    def test_13_resume_with_impact_reports_later_sessions(self):
        result = self.store.evaluate_local_adjustment("flow-user", {"action": "resume", "task_id": self.first["id"], "remaining_minutes": 150})
        self.assertTrue(result["requires_adjustment"])
        self.assertIn(self.second["id"], result["affected_task_ids"])

    def test_14_daily_checkin_only_evaluates_today(self):
        result = self.store.evaluate_local_adjustment("flow-user", {"action": "daily_checkin", "runtime_state": {"focus": 7, "energy": 6, "stress": 3}})
        self.assertEqual("today_unstarted_only", result["scope"])

    def test_15_daily_checkin_does_not_change_static_profile(self):
        before = self.store.get_profile("flow-user").get("learned_patterns") or []
        state = self.store.save_runtime_state("flow-user", {"focus": 2, "energy": 2, "stress": 6, "daily_checkin": True})
        self.store.evaluate_local_adjustment("flow-user", {"action": "daily_checkin", "runtime_state": state})
        self.assertEqual(before, self.store.get_profile("flow-user").get("learned_patterns") or [])

    def test_16_early_finish_keep_free_does_not_create_revision(self):
        result = self.store.evaluate_local_adjustment("flow-user", {"action": "early_finish", "choice": "keep_free"})
        self.assertFalse(result["requires_adjustment"])
        self.assertNotIn("proposed_plan", result)

    def test_17_task_metadata_update_preserves_stable_id(self):
        updated = self.store.patch_task(self.first["id"], {"due": "Tuesday 17:00", "title": "Analyze revised interviews", "duration": 75}, "flow-user")
        self.assertEqual(self.first["id"], updated["id"])

    def test_18_frontend_confirmed_drag_uses_revision_api(self):
        source = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn('/api/plans/revisions/propose', source)
        start = source.index("const revisedPatch = confirmedSchedulePlan.plan_patch")
        confirmed_branch = source[start:start + 5000]
        self.assertNotIn("patchBackendTask(task)", confirmed_branch)

    def test_19_frontend_pause_no_longer_calls_local_shifter(self):
        source = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("const local = pauseContinuationDraft", source)
        self.assertIn('/api/schedules/local-adjustment', source)

    def test_20_feedback_and_resume_return_to_plan_rail(self):
        source = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        resume = source[source.index("async function resumeInterruptedTask"):source.index("pauseForm.addEventListener")]
        feedback = source[source.index('feedbackForm.addEventListener("submit"'):source.index('document.getElementById("keepEarlyTimeFreeBtn")')]
        self.assertIn('rightRailMode = "plan"', resume)
        self.assertIn('rightRailMode = "plan"', feedback)

    def test_21_product_frontend_can_resume_reviewable_revision(self):
        revision = self.revision(9.25)
        current = self.store.proposed_plan("flow-user", "2026-08-03")
        self.assertEqual((revision["plan_id"], "proposed"), (current["plan_id"], current["plan_status"]))
        self.store.cancel_plan_revision("flow-user", {
            "plan_id": revision["plan_id"],
            "base_plan_id": self.confirmed["plan_id"],
        })
        self.assertIsNone(self.store.proposed_plan("flow-user", "2026-08-03"))

    def test_22_product_focus_reuses_confirmed_plan_session(self):
        first = self.store.ensure_execution_session("flow-user", self.first["id"])
        replay = self.store.ensure_execution_session("flow-user", self.first["id"])
        self.assertEqual(first["execution_session_id"], replay["execution_session_id"])
        self.assertEqual(self.first["id"], first["task_id"])
        self.assertEqual("ready", first["status"])
        self.assertEqual("flow-a", first["block_id"])


if __name__ == "__main__":
    unittest.main()
