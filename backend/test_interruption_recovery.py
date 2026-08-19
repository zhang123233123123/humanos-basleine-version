import tempfile
import unittest
from pathlib import Path

from backend.humanos_server import Store


class InterruptionRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "recovery.db")
        self.store.upsert_profile({"user_id": "u", "timezone": "Asia/Shanghai", "active_week_id": "2026-08-17", "weekly_context": {"week_id": "2026-08-17", "weekly_available_windows": "周一至周日 08:00-22:00"}})
        self.task = self.store.create_task("u", {"id": "task-1", "title": "Write analysis", "week_id": "2026-08-17", "duration": 60, "expected_difficulty": 7, "resource_modality": ["visual", "verbal"], "attention_mode": "continuous"})
        self.store.save_runtime_state("u", {"focus": 3, "energy": 2, "stress": 6, "request_id": "state-before-pause"})
        self.session = self.store.ensure_execution_session("u", {"task_id": "task-1", "planned_work_minutes": 60})
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET profile_trait_refs_json='[\"trait-1\"]' WHERE id=?", (self.session["execution_session_id"],))

    def tearDown(self):
        self.temp.cleanup()

    def test_pause_resume_feedback_forms_traceable_non_learning_episode(self):
        session_id = self.session["execution_session_id"]
        self.store.start_execution_session("u", {"execution_session_id": session_id, "actual_start_at": "2026-08-19T09:00:00+08:00", "request_id": "start"})
        interrupted = self.store.interrupt_execution_session("u", {
            "execution_session_id": session_id, "interruption_action": "continue_later",
            "paused_at": "2026-08-19T09:20:00+08:00", "actual_minutes": 20,
            "pause_reason": "Unexpected message", "progress": "Outline done", "next_step": "Draft section one",
            "resume_preference": "later_today", "preferred_resume_at": "2026-08-19T10:00:00+08:00",
            "request_id": "interrupt-1",
        })
        episode = interrupted["execution_session"]["interruption_episode"]
        self.assertEqual("pending", episode["status"])
        self.assertEqual(["trait-1"], episode["profile_trait_refs"])
        self.assertEqual(7, episode["task_demand_snapshot"]["expected_difficulty"])
        self.assertEqual(2, episode["runtime_state_snapshot"]["energy"])
        self.assertEqual(interrupted["context_dump"]["id"], episode["context_dump_id"])

        guidance = self.store.reentry_prompt("u", {"task_id": "task-1"})
        self.assertEqual(episode["id"], guidance["interruption_episode_id"])
        resumed = self.store.start_execution_session("u", {"execution_session_id": session_id, "actual_start_at": "2026-08-19T10:05:00+08:00", "request_id": "resume"})
        self.assertEqual(45, resumed["recovery_episode"]["resume_latency_minutes"])
        self.assertTrue(resumed["recovery_episode"]["reentry_guidance_generated_at"])
        self.store.end_execution_session("u", {"execution_session_id": session_id, "actual_end_at": "2026-08-19T10:35:00+08:00", "actual_minutes": 50, "request_id": "end"})
        feedback = self.store.save_execution_feedback("u", {"task_id": "task-1", "execution_session_id": session_id, "request_id": "feedback", "task_evaluation": {"completion": "partial", "actual_minutes": 50}, "state_evaluation": {"energy_after": 3}})
        settled = feedback["recovery_episode"]
        self.assertEqual("settled", settled["status"])
        self.assertEqual("partial", settled["outcome"]["completion"])
        self.assertEqual(30, settled["outcome"]["actual_minutes_after_resume"])
        summary = self.store.interruption_recovery_summary("u")["summary"]
        self.assertEqual((1, 1, 1), (summary["episode_count"], summary["resumed_count"], summary["settled_count"]))
        self.assertEqual(45, summary["median_resume_latency_minutes"])

        evidence = {item["claim_key"]: item for item in self.store.list_personalization_evidence("u") if item["claim_key"].startswith("interruption.recovery_")}
        self.assertEqual({"interruption.recovery_attempt", "interruption.recovery_outcome"}, set(evidence))
        self.assertTrue(all(item["eligible_for_pattern"] is False for item in evidence.values()))
        self.assertTrue(all(item["profile_write_allowed"] is False for item in evidence.values()))

    def test_second_pause_settles_prior_attempt_as_reinterrupted(self):
        session_id = self.session["execution_session_id"]
        self.store.start_execution_session("u", {"execution_session_id": session_id, "actual_start_at": "2026-08-19T09:00:00+08:00", "request_id": "start-first"})
        first = self.store.pause_execution_session("u", {"execution_session_id": session_id, "paused_at": "2026-08-19T09:10:00+08:00", "actual_minutes": 10, "pause_reason": "message", "request_id": "pause-first"})
        self.store.start_execution_session("u", {"execution_session_id": session_id, "actual_start_at": "2026-08-19T09:20:00+08:00", "request_id": "resume-first"})
        second = self.store.pause_execution_session("u", {"execution_session_id": session_id, "paused_at": "2026-08-19T09:25:00+08:00", "actual_minutes": 15, "pause_reason": "still blocked", "request_id": "pause-second"})
        episodes = {item["id"]: item for item in self.store.list_interruption_episodes("u")}
        prior = episodes[first["interruption_episode"]["id"]]
        current = episodes[second["interruption_episode"]["id"]]
        self.assertEqual("settled", prior["status"])
        self.assertTrue(prior["outcome"]["reinterrupted"])
        self.assertEqual(5, prior["outcome"]["actual_minutes_after_resume"])
        self.assertEqual("pending", current["status"])


if __name__ == "__main__":
    unittest.main()
