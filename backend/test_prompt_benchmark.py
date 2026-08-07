import unittest

from backend.run_prompt_benchmark import (
    extract_tasks,
    normalized_clock,
    normalized_date,
    score_expectations,
    semantic_signature,
)


class PromptBenchmarkScoringTests(unittest.TestCase):
    def test_task_count_deadline_and_missing_fields_are_scored(self) -> None:
        case = {
            "expect": {
                "task_count": 1,
                "schedule_type": "flexible_task",
                "deadline_clock": "18:00",
                "missing_fields": ["duration_minutes"],
            }
        }
        result = {
            "tasks": [
                {
                    "title": "完成论文",
                    "schedule_type": "flexible_task",
                    "deadline_at": "周五 18:00",
                    "duration_minutes": None,
                    "missing_fields": ["duration_minutes"],
                    "confidence": 0.9,
                }
            ]
        }
        checks, unscored = score_expectations(case, result, None)
        self.assertFalse(unscored)
        self.assertTrue(all(check["passed"] for check in checks))

    def test_hallucinated_missing_duration_fails_guard(self) -> None:
        case = {"expect": {"missing_fields": ["duration_minutes"]}}
        result = {"tasks": [{"title": "完成论文", "duration_minutes": 60, "missing_fields": []}]}
        checks, _ = score_expectations(case, result, None)
        self.assertEqual("hallucination_guard", checks[0]["metric"])
        self.assertFalse(checks[0]["passed"])

    def test_semantic_signature_ignores_title_whitespace(self) -> None:
        first = {"tasks": [{"title": "完成 论文", "schedule_type": "flexible_task"}]}
        second = {"tasks": [{"title": "完成论文", "schedule_type": "flexible_task"}]}
        self.assertEqual(semantic_signature(first, None), semantic_signature(second, None))
        self.assertEqual(1, len(extract_tasks(first)))

    def test_chinese_time_and_date_are_normalized_for_scoring(self) -> None:
        self.assertEqual("15:00", normalized_clock("明天下午三点"))
        self.assertEqual("2026-08-06", normalized_date("8月6日下午三点"))

    def test_next_week_absolute_date_is_not_current_week_schedulable(self) -> None:
        case = {"expect": {"current_week_schedulable": False}}
        result = {"tasks": [{"title": "完成报告", "deadline_at": "2026-08-10"}]}
        checks, _ = score_expectations(case, result, None, "2026-08-04")
        self.assertTrue(checks[0]["passed"])

    def test_explicit_state_accepts_json_boolean_strings(self) -> None:
        case = {"expect": {"explicit_state": {"fatigue": True}}}
        checks, _ = score_expectations(case, {"tasks": []}, {"explicit_state": {"fatigue": "true"}})
        self.assertTrue(checks[0]["passed"])


if __name__ == "__main__":
    unittest.main()
