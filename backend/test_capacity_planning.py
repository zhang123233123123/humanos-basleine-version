import unittest

from backend.app.application.build_capacity_context import build_capacity_context
from backend.app.application.rank_schedule_candidates import candidate_rank_key, select_best_candidate
from backend.app.domain.capacity import capacity_penalty, validate_capacity_assessment


class CapacityPlanningTests(unittest.TestCase):
    def test_context_separates_profile_and_runtime_capacity(self):
        context = build_capacity_context(
            {
                "deep_work_window": "09:00-12:00",
                "low_energy_window": "19:00-21:00",
                "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            },
            {"focus": 6, "energy": 5, "stress": 2, "mood": "good", "internal_only": "ignored"},
        )
        self.assertEqual(context["baseline"]["preferred_session_minutes"], 45)
        self.assertEqual(context["current_state"], {"focus": 6, "energy": 5, "stress": 2, "mood": "good"})

    def test_capacity_assessment_requires_evidence(self):
        assessment, violations = validate_capacity_assessment({"task_id": "task-1", "capacity_fit": "ideal"})
        self.assertEqual(assessment.level, "ideal")
        self.assertIn("missing_capacity_evidence", {item["type"] for item in violations})

    def test_risky_requires_tradeoff_and_unsuitable_is_rejected(self):
        _, risky = validate_capacity_assessment({"task_id": "task-1", "capacity_fit": "risky", "capacity_evidence": ["low energy"]})
        _, unsuitable = validate_capacity_assessment({"task_id": "task-2", "capacity_fit": "unsuitable", "capacity_evidence": ["capacity mismatch"]})
        self.assertIn("missing_capacity_tradeoff", {item["type"] for item in risky})
        self.assertIn("unsuitable_capacity_assignment", {item["type"] for item in unsuitable})

    def test_capacity_penalty_only_ranks_feasible_candidates(self):
        self.assertLess(capacity_penalty({"ideal": 2}), capacity_penalty({"risky": 1}))
        complete_risky = {"id": "complete", "validation": {"valid": True, "violations": []}, "metrics": {"remaining_minutes": 0, "deadline_risk_minutes": 0, "capacity_penalty": 40, "cognitive_fit_score": 0.5}}
        incomplete_ideal = {"id": "incomplete", "validation": {"valid": True, "violations": []}, "metrics": {"remaining_minutes": 30, "deadline_risk_minutes": 30, "capacity_penalty": 0, "cognitive_fit_score": 1}}
        self.assertLess(candidate_rank_key(complete_risky), candidate_rank_key(incomplete_ideal))
        self.assertEqual(select_best_candidate([incomplete_ideal, complete_risky], "incomplete")["id"], "complete")


if __name__ == "__main__":
    unittest.main()
