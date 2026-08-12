import unittest

from backend.app.application.chat_response import apply_existing_task_updates, initial_planner_response


class ChatResponseTests(unittest.TestCase):
    def test_initial_response_exposes_context_counts(self) -> None:
        result = initial_planner_response("add_task", {}, {"recent_tasks": [1], "retrieved_memories": [1, 2]})
        self.assertEqual(1, result["context"]["recent_task_count"])
        self.assertEqual(2, result["context"]["memory_count"])

    def test_existing_update_never_claims_duplicate_creation(self) -> None:
        response = initial_planner_response("reschedule", {}, {})
        result = apply_existing_task_updates(response, [{"title": "组会", "due": "明天 14:00"}])
        self.assertEqual("reschedule", result["intent"])
        self.assertIn("No duplicate task was created", result["reply"])


if __name__ == "__main__":
    unittest.main()
