import unittest

from backend.app.application.deterministic_scheduler import build_deterministic_plan
from backend.app.application.scheduling_traits import compile_scheduling_priors, weak_prior_score


def trait(*, trait_id="trait-energy", status="confirmed", confirmed=True, daypart="afternoon", band="high"):
    return {
        "trait_id": trait_id,
        "trait_key": "perceived_state.energy",
        "value": {"field": "energy", "band": band, "daypart": daypart},
        "scope": {"temporal_context": {"daypart": daypart}},
        "evidence_ids": ["e1", "e2", "e3"],
        "confidence_level": "high",
        "status": status,
        "user_confirmed": confirmed,
    }


class SchedulingTraitTests(unittest.TestCase):
    def test_only_confirmed_supported_traits_become_priors(self):
        priors = compile_scheduling_priors([
            trait(),
            trait(trait_id="forgotten", status="forgotten"),
            {**trait(trait_id="unsupported"), "trait_key": "reentry.stop_reason"},
        ])
        self.assertEqual(["trait-energy"], [item["trait_id"] for item in priors["hints"]])
        self.assertEqual("soft_tiebreak_only", priors["authority"])

    def test_current_self_report_suppresses_trait_score_for_today(self):
        priors = compile_scheduling_priors([trait()], {"source": "self_report", "energy": 2})
        today_score, used = weak_prior_score(
            start_minute=0 * 1440 + 14 * 60, task_demand="high", priors=priors, today_index=0,
        )
        tomorrow_score, tomorrow_used = weak_prior_score(
            start_minute=1 * 1440 + 14 * 60, task_demand="high", priors=priors, today_index=0,
        )
        self.assertEqual((0, []), (today_score, used))
        self.assertEqual((1, ["trait-energy"]), (tomorrow_score, tomorrow_used))

    def test_current_state_has_more_weight_than_long_term_trait(self):
        priors = compile_scheduling_priors([trait()], {"source": "self_report", "focus": 2, "energy": 2, "stress": 6})
        low_score, low_used = weak_prior_score(
            start_minute=0 * 1440 + 14 * 60, task_demand="low", priors=priors, today_index=0,
        )
        high_score, high_used = weak_prior_score(
            start_minute=0 * 1440 + 14 * 60, task_demand="high", priors=priors, today_index=0,
        )
        self.assertEqual((2, []), (low_score, low_used))
        self.assertEqual((0, []), (high_score, high_used))

    def test_weak_prior_selects_feasible_matching_slot_and_is_explained(self):
        profile = {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T07:00:00+08:00",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "周二 09:00-10:00；周二 14:00-15:00",
                "fixed_events": [], "temporary_constraints": [], "keep_buffer": False,
            },
        }
        priors = compile_scheduling_priors([trait()], {"source": "default"})
        result = build_deterministic_plan(
            profile=profile,
            tasks=[{"id": "hard", "title": "Hard task", "type": "flexible_task", "duration": 45, "priority": "high", "status": "queued", "due": "周二 18:00"}],
            analysis={"task_demands": [{"task_id": "hard", "level": "high"}]},
            payload={"week_id": "2026-08-03", "scheduling_priors": priors},
        )
        block = next(item for item in result["plan_patch"] if item.get("task_id") == "hard")
        self.assertEqual(14.0, block["start"])
        self.assertEqual(["trait-energy"], result["personalization"]["applied_trait_ids"])
        self.assertTrue(any("weak tiebreak" in item for item in block["constraint_evidence"]))

    def test_deadline_remains_authoritative_over_preferred_daypart(self):
        profile = {
            "timezone": "Asia/Shanghai", "_client_now": "2026-08-03T07:00:00+08:00",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "weekly_context": {"week_id": "2026-08-03", "weekly_available_windows": "周二 09:00-10:00；周二 14:00-15:00", "fixed_events": [], "temporary_constraints": [], "keep_buffer": False},
        }
        result = build_deterministic_plan(
            profile=profile,
            tasks=[{"id": "hard", "title": "Hard task", "type": "flexible_task", "duration": 45, "priority": "high", "status": "queued", "due": "周二 12:00"}],
            analysis={"task_demands": [{"task_id": "hard", "level": "high"}]},
            payload={"week_id": "2026-08-03", "scheduling_priors": compile_scheduling_priors([trait()])},
        )
        block = next(item for item in result["plan_patch"] if item.get("task_id") == "hard")
        self.assertEqual(9.0, block["start"])
        self.assertEqual([], result["personalization"]["applied_trait_ids"])


if __name__ == "__main__":
    unittest.main()
