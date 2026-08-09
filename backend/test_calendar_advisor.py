import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.humanos_server import Store


class CalendarAdvisorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp_dir.name) / "advisor.db")
        self.user_id = "advisor-user"
        self.store.ensure_profile(self.user_id)
        self.store.create_task(self.user_id, {
            "title": "写报告",
            "due": "今天 18:00",
            "duration": 60,
        })

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_query_uses_model_without_mutating_business_records(self) -> None:
        before_tasks = self.store.list_tasks(self.user_id)
        before_sessions = self.store.list_execution_sessions(self.user_id)

        with patch("backend.humanos_server.chat_completion", return_value={
            "intent": "calendar_query",
            "reply": "今天最需要注意的是 18:00 前完成写报告。",
            "handoff_text": None,
        }) as completion:
            result = self.store.calendar_advisor_turn(
                self.user_id,
                "今天最需要注意什么？",
                {"locale": "zh"},
            )

        self.assertTrue(completion.called)
        self.assertEqual("calendar_query", result["intent"])
        self.assertIn("18:00", result["reply"])
        self.assertEqual(before_tasks, self.store.list_tasks(self.user_id))
        self.assertEqual(before_sessions, self.store.list_execution_sessions(self.user_id))

    def test_explicit_write_request_is_handed_off_without_model_call(self) -> None:
        with patch("backend.humanos_server.chat_completion") as completion:
            result = self.store.calendar_advisor_turn(
                self.user_id,
                "把写报告推迟到明天",
                {"locale": "zh"},
            )

        completion.assert_not_called()
        self.assertEqual("planner_handoff", result["intent"])
        self.assertTrue(result["handoff_required"])
        self.assertEqual([], result["tasks"])


if __name__ == "__main__":
    unittest.main()
