import tempfile
import unittest
from pathlib import Path

from backend.humanos_server import Store


class ResearchEditExecutionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.tmp.name) / "humanos.db")
        self.profile = self.store.upsert_profile({
            "user_id": "u", "timezone": "Asia/Shanghai", "role": "student",
            "deep_work_window": "09:00-11:30",
            "research_context": {"planning_tools": ["calendar_app"], "primary_planning_tool": "calendar_app", "planning_tool_use_frequency": "daily"},
            "weekly_context": {"week_id": "2026-08-03", "weekly_available_windows": "周一至周日 08:00-21:00", "context_items": [], "keep_buffer": False},
        })
        self.store.reconcile_weekly_setup("u", {
            "week_id": "2026-08-03", "profile": self.profile,
            "tasks": [{"title": "Analyze interviews", "due": "周日 18:00前完成", "duration": 60, "priority": "高", "expected_difficulty": 6}],
        })
        self.task = self.store.list_tasks("u")[0]
        self.initial = {"block_id": "block-1", "task_id": self.task["id"], "day_index": 6, "start": 9.0, "end": 10.0, "session_minutes": 60, "planned_work_minutes": 60}
        self.plan = self.store.save_proposed_plan("u", {"plan_patch": [self.initial]}, {"week_id": "2026-08-03", "request_id": "proposal-1"})

    def tearDown(self):
        self.tmp.cleanup()

    def moved(self):
        return {**self.initial, "start": 10.0, "end": 11.0}

    def confirm(self, patch, rationale_marker=False):
        payload = {"plan_id": self.plan["plan_id"], "plan_revision": self.plan["plan_revision"], "week_id": "2026-08-03", "plan_patch": patch, "unscheduled_tasks": [], "ai_task_analysis": {}, "decision": self.plan}
        if rationale_marker:
            payload["rationale"] = {"reason_codes": ["better_timing"], "generalizability": "only_this_week", "response_status": "answered", "request_id": "reason-1"}
        return self.store.confirm_plan("u", payload)

    # Planning background (1-6)
    def test_01_research_context_round_trips(self): self.assertEqual(["calendar_app"], self.store.get_profile("u")["research_context"]["planning_tools"])
    def test_02_research_context_has_self_report_source(self): self.assertEqual("user_self_report", self.store.get_profile("u")["research_context"]["source"])
    def test_03_research_context_has_capture_time(self): self.assertTrue(self.store.get_profile("u")["research_context"]["captured_at"])
    def test_04_research_context_revision_starts_at_one(self): self.assertEqual(1, self.store.get_profile("u")["research_context"]["revision"])
    def test_05_unchanged_research_context_does_not_increment(self):
        before = self.store.get_profile("u")["research_context"]["revision"]
        self.store.upsert_profile({"user_id": "u", "research_context": self.store.get_profile("u")["research_context"]})
        self.assertEqual(before, self.store.get_profile("u")["research_context"]["revision"])
    def test_06_changed_research_context_increments(self):
        self.store.upsert_profile({"user_id": "u", "research_context": {"planning_tools": ["paper_planner"], "primary_planning_tool": "paper_planner", "planning_tool_use_frequency": "weekly"}})
        self.assertEqual(2, self.store.get_profile("u")["research_context"]["revision"])

    # Edit episode and canonical diff (7-16)
    def test_07_proposal_creates_episode(self): self.assertTrue(self.plan["edit_episode_id"])
    def test_08_episode_captures_research_revision(self): self.assertEqual(1, self.store.get_edit_episode("u", self.plan["edit_episode_id"])["research_context_revision"])
    def test_09_successful_edit_event_is_effective(self):
        result = self.store.record_plan_edit_event("u", {"edit_episode_id": self.plan["edit_episode_id"], "event_type": "move_session", "before": self.initial, "after": self.moved(), "validation_result": {"valid": True}, "request_id": "event-1"})
        self.assertTrue(result["effective"])
    def test_10_failed_edit_event_is_not_effective(self):
        result = self.store.record_plan_edit_event("u", {"edit_episode_id": self.plan["edit_episode_id"], "event_type": "edit_attempt_failed", "validation_result": {"valid": False}, "request_id": "event-fail"})
        self.assertFalse(result["effective"])
    def test_11_event_request_is_idempotent(self):
        payload = {"edit_episode_id": self.plan["edit_episode_id"], "event_type": "move_session", "validation_result": {"valid": True}, "request_id": "same-event"}
        self.store.record_plan_edit_event("u", payload)
        self.assertTrue(self.store.record_plan_edit_event("u", payload)["replayed"])
        self.assertEqual(1, len(self.store.list_personalization_evidence("u")))
    def test_12_move_is_not_misclassified_as_resize(self):
        diff = self.store.canonical_plan_diff([self.initial], [self.moved()])
        self.assertEqual((1, 0), (len(diff["moved"]), len(diff["resized"])))
    def test_13_true_resize_is_detected(self): self.assertEqual(1, len(self.store.canonical_plan_diff([self.initial], [{**self.initial, "end": 10.5, "session_minutes": 90}])["resized"]))
    def test_14_added_block_is_detected(self): self.assertEqual(1, len(self.store.canonical_plan_diff([], [self.initial])["added"]))
    def test_15_removed_block_is_detected(self): self.assertEqual(1, len(self.store.canonical_plan_diff([self.initial], [])["removed"]))
    def test_16_unchanged_plan_skips_rationale(self): self.assertFalse(self.confirm([self.initial])["requires_rationale"])

    # Rationale + execution state machine (17-24)
    def test_17_changed_plan_requires_rationale(self): self.assertTrue(self.confirm([self.moved()])["requires_rationale"])
    def test_18_rationale_confirms_changed_plan(self): self.assertEqual("confirmed", self.confirm([self.moved()], True)["plan"]["plan_status"])
    def test_19_confirmation_creates_ready_execution(self):
        self.confirm([self.initial]); self.assertIn(self.store.current_execution("u")["mode"], {"up_next", "ready_to_start"})
    def test_20_start_is_explicit(self):
        self.confirm([self.initial]); current = self.store.current_execution("u"); started = self.store.start_execution_session("u", {"execution_session_id": current["session"]["execution_session_id"], "request_id": "start-1"}); self.assertEqual("running", started["status"])
    def test_21_start_request_is_idempotent(self):
        self.confirm([self.initial]); current = self.store.current_execution("u"); payload = {"execution_session_id": current["session"]["execution_session_id"], "request_id": "start-same"}; self.store.start_execution_session("u", payload); self.assertEqual("running", self.store.start_execution_session("u", payload)["status"]); self.assertEqual(1, len([item for item in self.store.list_personalization_evidence("u") if item["claim_key"] == "execution_behavior.start"]))
    def test_22_pause_preserves_session_remaining(self):
        self.confirm([self.initial]); current = self.store.current_execution("u"); run = self.store.start_execution_session("u", {"execution_session_id": current["session"]["execution_session_id"]}); paused = self.store.pause_execution_session("u", {"execution_session_id": run["execution_session_id"], "actual_minutes": 15}); self.assertEqual(("paused", 45), (paused["status"], paused["session_remaining_minutes"]))
    def test_23_end_does_not_auto_complete_task(self):
        self.confirm([self.initial]); current = self.store.current_execution("u"); run = self.store.start_execution_session("u", {"execution_session_id": current["session"]["execution_session_id"]}); self.store.end_execution_session("u", {"execution_session_id": run["execution_session_id"], "actual_minutes": 60}); self.assertNotEqual("completed", self.store.get_task(self.task["id"], "u")["status"])
    def test_24_feedback_can_complete_task(self):
        self.confirm([self.initial]); current = self.store.current_execution("u"); run = self.store.start_execution_session("u", {"execution_session_id": current["session"]["execution_session_id"]}); self.store.end_execution_session("u", {"execution_session_id": run["execution_session_id"], "actual_minutes": 60}); self.store.save_execution_feedback("u", {"task_id": self.task["id"], "execution_session_id": run["execution_session_id"], "task_evaluation": {"completion": "completed", "actual_minutes": 60, "remaining_duration_minutes": 0}, "state_evaluation": {}, "recommendation_evaluation": {}}); self.assertEqual("completed", self.store.get_task(self.task["id"], "u")["status"])

    def test_execution_lifecycle_projects_scoped_observed_evidence(self):
        self.confirm([self.initial])
        current = self.store.current_execution("u")
        started = self.store.start_execution_session("u", {"execution_session_id": current["session"]["execution_session_id"], "request_id": "evidence-start"})
        paused = self.store.pause_execution_session("u", {"execution_session_id": started["execution_session_id"], "actual_minutes": 15, "request_id": "evidence-pause"})
        resumed = self.store.start_execution_session("u", {"execution_session_id": paused["execution_session_id"], "request_id": "evidence-resume"})
        self.store.end_execution_session("u", {"execution_session_id": resumed["execution_session_id"], "actual_minutes": 30, "request_id": "evidence-end"})
        evidence = [item for item in self.store.list_personalization_evidence("u") if item["source_type"] == "system_observation"]
        self.assertEqual(
            ["execution_behavior.start", "execution_behavior.pause", "execution_behavior.resume", "execution_behavior.end"],
            [item["claim_key"] for item in evidence],
        )
        self.assertTrue(all(item["scope"]["task_id"] == self.task["id"] for item in evidence))
        end = evidence[-1]
        self.assertEqual(30, end["structured_value"]["outcome"]["actual_minutes"])
        self.assertTrue(all(item["profile_write_allowed"] is False for item in evidence))

    def test_feedback_projects_explicit_outcome_without_learning_profile(self):
        self.confirm([self.initial])
        current = self.store.current_execution("u")
        started = self.store.start_execution_session("u", {"execution_session_id": current["session"]["execution_session_id"]})
        self.store.end_execution_session("u", {"execution_session_id": started["execution_session_id"], "actual_minutes": 50})
        before_patterns = list(self.store.get_profile("u")["learned_patterns"])
        self.store.save_execution_feedback("u", {
            "task_id": self.task["id"], "execution_session_id": started["execution_session_id"],
            "request_id": "feedback-evidence", "task_evaluation": {
                "completion": "completed", "actual_minutes": 50, "remaining_duration_minutes": 0,
            }, "state_evaluation": {"energy": 4}, "recommendation_evaluation": {"helpful": True},
        })
        explicit = next(item for item in self.store.list_personalization_evidence("u") if item["claim_key"] == "execution_feedback.outcome")
        self.assertTrue(explicit["user_explicit"])
        self.assertEqual(50, explicit["structured_value"]["task_evaluation"]["actual_minutes"])
        self.assertEqual(before_patterns, self.store.get_profile("u")["learned_patterns"])

    def test_client_reported_transition_cannot_poison_pattern_evidence(self):
        transition = self.store.record_state_transition("u", {
            "task_id": self.task["id"],
            "before_state": {"execution_status": "ready"},
            "action": {"type": "start"},
            "actual_state": {"execution_status": "running"},
        })
        evidence = next(item for item in self.store.list_personalization_evidence("u") if item["source_id"] == transition["id"])
        self.assertFalse(evidence["eligible_for_pattern"])
        self.assertFalse(evidence["structured_value"]["trusted_execution_transition"])

    def test_successful_drag_projects_scoped_behavior_evidence(self):
        self.store.record_plan_edit_event("u", {
            "edit_episode_id": self.plan["edit_episode_id"], "task_id": self.task["id"],
            "block_id": "block-1", "event_type": "move_session", "before": self.initial,
            "after": self.moved(), "interaction_source": "calendar_drag",
            "validation_result": {"valid": True}, "request_id": "scoped-drag",
        })
        evidence = self.store.list_personalization_evidence("u")[0]
        behavior = self.store.list_behavior_events("u")[0]
        self.assertEqual("schedule_behavior.move_session", evidence["claim_key"])
        self.assertEqual("move_session", behavior["event_type"])
        self.assertEqual(evidence["source_id"], behavior["source_id"])
        self.assertEqual(self.task["id"], evidence["scope"]["task_id"])
        self.assertEqual("flexible_task", evidence["scope"]["task_schedule_type"])
        self.assertTrue(evidence["eligible_for_pattern"])
        self.assertFalse(evidence["profile_write_allowed"])

    def test_failed_or_undone_edit_is_not_pattern_evidence(self):
        failed = self.store.record_plan_edit_event("u", {
            "edit_episode_id": self.plan["edit_episode_id"], "task_id": self.task["id"],
            "event_type": "edit_attempt_failed", "validation_result": {"valid": False},
            "request_id": "failed-projection",
        })
        moved = self.store.record_plan_edit_event("u", {
            "edit_episode_id": self.plan["edit_episode_id"], "task_id": self.task["id"],
            "event_type": "move_session", "before": self.initial, "after": self.moved(),
            "request_id": "move-before-undo",
        })
        self.store.record_plan_edit_event("u", {
            "edit_episode_id": self.plan["edit_episode_id"], "event_type": "undo_edit",
            "reverts_event_id": moved["event_id"], "request_id": "undo-projection",
        })
        evidence = {item["source_id"]: item for item in self.store.list_personalization_evidence("u")}
        behavior = {item["source_id"]: item for item in self.store.list_behavior_events("u")}
        self.assertFalse(evidence[failed["event_id"]]["eligible_for_pattern"])
        self.assertFalse(evidence[moved["event_id"]]["eligible_for_pattern"])
        self.assertFalse(behavior[moved["event_id"]]["effective"])

    def test_answered_rationale_becomes_explicit_evidence_without_updating_profile(self):
        before_patterns = list(self.store.get_profile("u")["learned_patterns"])
        payload = {
            "plan_id": self.plan["plan_id"], "plan_revision": self.plan["plan_revision"],
            "week_id": "2026-08-03", "plan_patch": [self.moved()], "unscheduled_tasks": [],
            "ai_task_analysis": {}, "decision": self.plan,
            "rationale": {
                "reason_codes": ["better_timing"], "raw_user_response": "I focus better later today",
                "generalizability": "only_this_week", "response_status": "answered",
                "affected_task_ids": [self.task["id"]], "request_id": "rationale-evidence",
            },
        }
        self.store.confirm_plan("u", payload)
        rationale = next(item for item in self.store.list_personalization_evidence("u") if item["claim_key"] == "schedule_edit.rationale")
        self.assertTrue(rationale["user_explicit"])
        self.assertEqual("self_report", rationale["source_type"])
        self.assertEqual(before_patterns, self.store.get_profile("u")["learned_patterns"])


if __name__ == "__main__":
    unittest.main()
