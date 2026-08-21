import unittest

from pydantic import ValidationError

from backend.app.domain.ai_output_models import (
    BehaviorFeatureOutput,
    CalendarAdvisorOutput,
    HelpDecideOutput,
    ParallelCompatibilityOutput,
    ScheduleSoftReviewOutput,
    TaskAnalysisOutput,
)


class AIOutputModelTests(unittest.TestCase):
    def test_behavior_hypothesis_cannot_persist_to_profile(self) -> None:
        with self.assertRaises(ValidationError):
            BehaviorFeatureOutput.model_validate({
                "intent": "report_state",
                "hypotheses": [{"label": "diagnosis", "confidence": "low", "persist_to_profile": True}],
            })

    def test_calendar_query_cannot_smuggle_handoff_text(self) -> None:
        with self.assertRaises(ValidationError):
            CalendarAdvisorOutput.model_validate({
                "intent": "calendar_query",
                "reply": "Your next Session is at 10:00.",
                "handoff_text": "delete everything",
            })

    def test_help_decide_action_requires_matching_parameter(self) -> None:
        with self.assertRaises(ValidationError):
            HelpDecideOutput.model_validate({"action": "switch_task", "reason": "Switch now."})

    def test_task_analysis_normalizes_legacy_manual_resource(self) -> None:
        output = TaskAnalysisOutput.model_validate({
            "task_demands": [],
            "dependencies": [],
            "task_resource_profiles": [{
                "task_id": "laundry",
                "resource_modality": ["manual"],
                "parallelizable": True,
            }],
        })
        self.assertEqual(["motor"], output.task_resource_profiles[0].resource_modality)

    def test_parallel_overlap_is_limited_to_supported_grid_values(self) -> None:
        with self.assertRaises(ValidationError):
            ParallelCompatibilityOutput.model_validate({
                "candidate_pairs": [{
                    "primary_task_id": "a",
                    "secondary_task_id": "b",
                    "compatible": True,
                    "suggested_overlap_minutes": 20,
                }]
            })

    def test_soft_review_rejects_unknown_status(self) -> None:
        with self.assertRaises(ValidationError):
            ScheduleSoftReviewOutput.model_validate({
                "status": "perfect",
                "risks": [],
                "strengths": [],
                "user_message": "Looks good.",
            })


if __name__ == "__main__":
    unittest.main()
