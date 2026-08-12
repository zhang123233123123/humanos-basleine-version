import tempfile
import unittest
from pathlib import Path

from backend.app.application.deterministic_scheduler import build_deterministic_plan
from backend.humanos_server import Store


class AutomaticPatternLearningTests(unittest.TestCase):
    def test_three_matching_episodes_become_an_active_preference(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = Store(Path(temp_dir) / "automatic-patterns.db")
            user_id = "automatic-pattern-user"
            store.ensure_profile(user_id)
            label = "Prefers shorter focus sessions"

            for index in range(3):
                store.add_memory(
                    user_id=user_id,
                    source_type="episodic_memory",
                    source_id=f"feedback-{index}",
                    task_id=None,
                    text=f"Session {index} felt too long.",
                    metadata={"eligible_for_pattern": True, "pattern_label": label},
                )

            result = store.auto_learn_patterns(user_id)
            learned = next(item for item in result["profile"]["learned_patterns"] if item["pattern_label"] == label)
            self.assertTrue(learned["auto_learned"])
            self.assertTrue(learned["active"])
            self.assertFalse(learned["user_confirmed"])
            self.assertEqual(learned["evidence_count"], 3)
            self.assertNotIn(label, {item["pattern_label"] for item in store.pattern_candidates(user_id)})

    def test_removed_automatic_preference_is_not_immediately_relearned(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = Store(Path(temp_dir) / "suppressed-patterns.db")
            user_id = "suppressed-pattern-user"
            store.ensure_profile(user_id)
            label = "Prefers work sessions earlier than originally suggested"

            for index in range(3):
                store.add_memory(
                    user_id=user_id,
                    source_type="episodic_memory",
                    source_id=f"feedback-{index}",
                    task_id=None,
                    text=f"Session {index} was too late.",
                    metadata={"eligible_for_pattern": True, "pattern_label": label},
                )

            store.auto_learn_patterns(user_id)
            store.manage_pattern(user_id, {"action": "forget", "pattern_label": label})
            result = store.auto_learn_patterns(user_id)
            labels = {item["pattern_label"] for item in result["profile"]["learned_patterns"]}
            self.assertNotIn(label, labels)
            self.assertEqual(result["newly_learned"], [])

    def test_learned_session_preference_changes_the_next_new_plan(self) -> None:
        profile = {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T08:00:00+08:00",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "learned_patterns": [{
                "pattern_label": "Prefers shorter focus sessions",
                "evidence_count": 3,
                "auto_learned": True,
                "active": True,
            }],
            "weekly_context": {
                "weekly_available_windows": "Monday 08:00-18:00",
                "context_items": [],
                "keep_buffer": False,
            },
        }
        task = {
            "id": "paper",
            "title": "Write paper",
            "task_type": "flexible_task",
            "due": "Monday 18:00",
            "duration": 60,
            "priority": "high",
            "status": "queued",
        }

        result = build_deterministic_plan(profile=profile, tasks=[task], payload={"rebuild_from_scratch": True})

        sessions = [item for item in result["plan_patch"] if item.get("task_id") == "paper"]
        self.assertEqual([30, 30], [item["planned_work_minutes"] for item in sessions])
        self.assertEqual(30, result["scheduler"]["session_minutes"])
        self.assertEqual(45, result["scheduler"]["explicit_session_minutes"])
        self.assertIn("Prefers shorter focus sessions", result["scheduler"]["directly_applied_patterns"])


if __name__ == "__main__":
    unittest.main()
