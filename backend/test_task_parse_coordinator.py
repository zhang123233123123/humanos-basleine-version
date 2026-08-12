import unittest
from unittest.mock import Mock

from backend.app.application.task_parse_coordinator import parse_with_validation_retry


class TaskParseCoordinatorTests(unittest.TestCase):
    def test_invalid_first_result_is_retried_with_feedback(self) -> None:
        parser = Mock(side_effect=[
            [{"title": "期末复习", "schedule_type": "flexible_task"}, {"title": "三个小时", "duration_minutes": 180}],
            [{"title": "期末复习", "schedule_type": "flexible_task", "duration_minutes": 180, "deadline_at": "2026-08-14T23:59:00+08:00"}],
        ])
        events = []
        result = parse_with_validation_retry(
            "周五前完成期末复习，大概三个小时",
            expected_count=1,
            current_time="2026-08-12T12:00:00+08:00",
            timezone_name="Asia/Shanghai",
            chat_context=None,
            parser=parser,
            record_event=lambda name, details: events.append((name, details)),
        )
        self.assertEqual("期末复习", result[0]["title"])
        self.assertEqual(2, parser.call_count)
        self.assertTrue(parser.call_args.kwargs["validation_feedback"])
        self.assertEqual("task_parse_validation_recovered", events[-1][0])

    def test_two_invalid_results_return_none_for_local_fallback(self) -> None:
        parser = Mock(return_value=[{"title": "三个小时"}])
        result = parse_with_validation_retry(
            "周五前完成期末复习，大概三个小时",
            expected_count=1,
            current_time="2026-08-12T12:00:00+08:00",
            timezone_name="Asia/Shanghai",
            chat_context=None,
            parser=parser,
            record_event=lambda *_: None,
        )
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
