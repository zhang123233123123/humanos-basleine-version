import unittest

from backend.app.application.trait_effects import summarize_trait_effects


def trait(status="confirmed"):
    return {"trait_id": "t1", "trait_key": "perceived_state.energy", "value": {"daypart": "afternoon"}, "status": status, "user_confirmed": True}


def outcome(index, completion, timing):
    return {
        "evidence_id": f"e{index}", "claim_key": "profile_trait.execution_outcome",
        "structured_value": {"profile_trait_id": "t1", "execution_session_id": f"s{index}", "task_evaluation": {"completion": completion}, "recommendation_evaluation": {"timing_fit": timing}},
    }


class TraitEffectSummaryTests(unittest.TestCase):
    def test_three_positive_observations_are_descriptive_not_causal(self):
        result = summarize_trait_effects([trait()], [outcome(i, "completed", "helpful") for i in range(3)])[0]
        self.assertEqual("initially_consistent", result["assessment"])
        self.assertEqual(3, result["usage_with_feedback_count"])
        self.assertFalse(result["causal_claim_allowed"])
        self.assertFalse(result["profile_write_allowed"])

    def test_negative_and_mixed_boundaries_are_calibrated(self):
        negative = summarize_trait_effects([trait()], [outcome(i, "not_started", "unhelpful") for i in range(3)])[0]
        mixed = summarize_trait_effects([trait()], [outcome(1, "completed", "helpful"), outcome(2, "not_started", "unhelpful"), outcome(3, "partial", "")])[0]
        self.assertEqual("possible_mismatch", negative["assessment"])
        self.assertEqual("mixed", mixed["assessment"])

    def test_forgotten_traits_and_unrelated_evidence_are_excluded(self):
        unrelated = {"evidence_id": "x", "claim_key": "execution_feedback.outcome", "structured_value": {"profile_trait_id": "t1"}}
        self.assertEqual([], summarize_trait_effects([trait("forgotten")], [outcome(1, "completed", "helpful")]))
        result = summarize_trait_effects([trait()], [unrelated])[0]
        self.assertEqual(0, result["usage_with_feedback_count"])
        self.assertEqual("insufficient_data", result["assessment"])


if __name__ == "__main__":
    unittest.main()
