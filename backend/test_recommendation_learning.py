import unittest
import importlib.util
from pathlib import Path

from backend.app.application.recommendation_learning import recommendation_pattern_label

_learning_spec = importlib.util.spec_from_file_location("profile_learning_policy", Path(__file__).parent / "app/domain/profile/learning.py")
_learning = importlib.util.module_from_spec(_learning_spec)
assert _learning_spec and _learning_spec.loader
_learning_spec.loader.exec_module(_learning)
build_pattern_candidates = _learning.build_pattern_candidates
promote_confirmed_pattern = _learning.promote_confirmed_pattern


class RecommendationLearningTests(unittest.TestCase):
    def test_feedback_label_is_stable_by_reason_action_and_outcome(self) -> None:
        self.assertEqual(
            "interruption:tired->short_break:accepted",
            recommendation_pattern_label(reason="Tired", selected_action="short break", accepted=True),
        )

    def test_three_similar_episodes_create_user_confirmable_candidate(self) -> None:
        label = "interruption:tired->short_break:accepted"
        candidates = build_pattern_candidates(
            [{"metadata": {"pattern_label": label}, "created_at": 1_723_500_000_000 + index} for index in range(3)],
            timezone_name="Asia/Shanghai",
        )
        self.assertEqual("candidate", candidates[0]["status"])
        self.assertTrue(candidates[0]["requires_user_confirmation"])

    def test_confirmed_candidate_can_be_promoted_without_mutating_plan(self) -> None:
        result = promote_confirmed_pattern([], pattern_label="interruption:tired->short_break:accepted", evidence_count=3, user_confirmed=True, confirmed_at=10)
        self.assertEqual(3, result[0]["evidence_count"])
        self.assertTrue(result[0]["user_confirmed"])


if __name__ == "__main__":
    unittest.main()
