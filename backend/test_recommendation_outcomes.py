import unittest

from backend.app.application.recommendation_outcomes import summarize_recommendation_outcomes


class RecommendationOutcomeTests(unittest.TestCase):
    def test_links_feedback_to_recovery_episode_without_causal_claim(self):
        result = summarize_recommendation_outcomes(
            [
                {"payload": {"recommendation_id": "rec-1", "accepted": True, "recommended_action": "continue_later", "selected_action": "continue_later", "created_at": 10}},
                {"payload": {"recommendation_id": "rec-2", "accepted": False, "recommended_action": "short_break", "selected_action": "user_choice", "created_at": 9}},
            ],
            [{"id": "episode-1", "request_id": "rec-1:pause", "status": "settled", "resume_latency_minutes": 25, "outcome": {"completion": "partial", "reinterrupted": True}}],
        )
        self.assertEqual((2, 1, 1), (result["recommendation_count"], result["accepted_count"], result["rejected_count"]))
        self.assertEqual(25, result["median_resume_latency_minutes"])
        self.assertEqual(1, result["completion"]["partial"])
        self.assertEqual(1, result["reinterrupted_count"])
        self.assertFalse(result["causal_claim_allowed"])

    def test_duplicate_feedback_events_count_latest_recommendation_once(self):
        result = summarize_recommendation_outcomes(
            [
                {"payload": {"recommendation_id": "rec-1", "accepted": True, "created_at": 2}},
                {"payload": {"recommendation_id": "rec-1", "accepted": False, "created_at": 1}},
            ],
            [],
        )
        self.assertEqual((1, 1, 0), (result["recommendation_count"], result["accepted_count"], result["rejected_count"]))

    def test_accepted_recommendation_without_settled_episode_stays_pending(self):
        result = summarize_recommendation_outcomes(
            [{"payload": {"recommendation_id": "rec-1", "accepted": True}}],
            [],
        )
        self.assertEqual(1, result["outcome_pending_count"])
        self.assertEqual(0, result["settled_outcome_count"])

    def test_continue_current_links_later_feedback_by_session(self):
        result = summarize_recommendation_outcomes(
            [{"payload": {"recommendation_id": "rec-1", "accepted": True, "execution_session_id": "exec-1"}}],
            [],
            [{"payload": {"execution_session_id": "exec-1", "task_evaluation": {"completion": "completed"}}, "created_at": 2}],
        )
        self.assertEqual(1, result["settled_outcome_count"])
        self.assertEqual(1, result["completion"]["completed"])


if __name__ == "__main__":
    unittest.main()
