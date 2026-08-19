import unittest

from backend.app.application.trait_effects import summarize_trait_effects


def trait(status="confirmed"):
    return {"trait_id": "t1", "trait_key": "perceived_state.energy", "value": {"daypart": "afternoon"}, "status": status, "user_confirmed": True}


def outcome(index, completion, timing, attribution="independent"):
    return {
        "evidence_id": f"e{index}", "claim_key": "profile_trait.execution_outcome",
        "structured_value": {"profile_trait_id": "t1", "execution_session_id": f"s{index}", "task_evaluation": {"completion": completion}, "recommendation_evaluation": {"timing_fit": timing}, "execution_context": {"attribution": attribution}},
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

    def test_parallel_and_legacy_unknown_outcomes_do_not_drive_trait_assessment(self):
        evidence = [
            outcome(1, "completed", "helpful"),
            outcome(2, "completed", "helpful"),
            outcome(3, "completed", "helpful"),
            outcome(4, "not_started", "unhelpful", "parallel"),
            outcome(5, "not_started", "unhelpful", "parallel"),
            outcome(6, "not_started", "unhelpful", "unknown"),
        ]
        result = summarize_trait_effects([trait()], evidence)[0]
        self.assertEqual("initially_consistent", result["assessment"])
        self.assertEqual(3, result["usage_with_feedback_count"])
        self.assertEqual(6, result["total_linked_feedback_count"])
        self.assertEqual({
            "independent_count": 3, "parallel_count": 2, "unknown_count": 1,
            "parallel_excluded_from_assessment": True, "unknown_excluded_from_assessment": True,
        }, result["attribution"])
        self.assertEqual(2, result["parallel_outcomes"]["completion"]["not_started"])


if __name__ == "__main__":
    unittest.main()
