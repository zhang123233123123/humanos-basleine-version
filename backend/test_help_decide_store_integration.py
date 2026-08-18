import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.humanos_server import Store


class HelpDecideStoreIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "help-decide.db")
        self.user_id = "integration-user"
        self.store.ensure_profile(self.user_id)

    def tearDown(self) -> None:
        self.temp.cleanup()

    @patch("backend.humanos_server.now_ms")
    def test_three_rejected_recommendations_form_candidate_without_profile_mutation(self, mocked_now) -> None:
        label = "interruption:tired->user_choice:rejected"
        days = [1_723_500_000_000, 1_723_586_400_000, 1_723_586_400_001]
        mocked_now.side_effect = [value for day in days for value in (day, day)]
        for index in range(3):
            self.store.save_help_decide_feedback(self.user_id, {
                "recommendation_id": f"rec-{index}",
                "task_id": "task",
                "reason": "tired",
                "accepted": False,
                "recommended_action": "short_break",
                "selected_action": "user_choice",
            })
        candidate = next(item for item in self.store.pattern_candidates(self.user_id) if item["pattern_label"] == label)
        profile = self.store.ensure_profile(self.user_id)
        self.assertEqual((3, "candidate", True), (candidate["episode_count"], candidate["status"], candidate["requires_user_confirmation"]))
        self.assertFalse(any(item.get("pattern_label") == label for item in profile.get("learned_patterns") or []))

    @patch("backend.humanos_server.now_ms")
    def test_user_confirmation_promotes_candidate_without_plan_write(self, mocked_now) -> None:
        label = "interruption:tired->short_break:accepted"
        days = [1_723_500_000_000, 1_723_586_400_000, 1_723_672_800_000, 1_723_672_800_001, 1_723_672_800_002]
        # Feedback persistence and its audit event each read the clock once.
        # Promotion also reads the clock for confirmation and profile indexing.
        mocked_now.side_effect = [value for day in days for value in (day, day)] + [1_723_672_800_003] * 8
        for index in range(5):
            self.store.save_help_decide_feedback(self.user_id, {
                "recommendation_id": f"accept-{index}", "reason": "tired", "accepted": True,
                "recommended_action": "short_break", "selected_action": "short_break",
            })
        before_revision = self.store.ensure_profile(self.user_id).get("active_plan_revision")
        result = self.store.promote_pattern(self.user_id, {"pattern_label": label, "user_confirmed": True})
        self.assertEqual(before_revision, result["active_plan_revision"])
        self.assertEqual(label, result["promoted_pattern"]["pattern_label"])


if __name__ == "__main__":
    unittest.main()
