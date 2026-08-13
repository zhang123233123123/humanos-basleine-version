import unittest

from backend.app.application.chat_routing import should_parse_task_candidates
from backend.app.domain.intent import classify_intent


class ChatRoutingTests(unittest.TestCase):
    def test_future_task_enters_task_parser(self) -> None:
        text = "我需要在周五晚上12点之前完成期末复习，大概需要三个小时"
        self.assertTrue(should_parse_task_candidates(text, classify_intent(text, "progress_update")))

    def test_completed_progress_does_not_create_duplicate_task(self) -> None:
        text = "我刚刚已经完成了期末复习的一半"
        self.assertFalse(should_parse_task_candidates(text, classify_intent(text, "add_task")))

    def test_pause_does_not_enter_task_parser(self) -> None:
        text = "这个任务先暂停，我现在不想继续做"
        self.assertFalse(should_parse_task_candidates(text, classify_intent(text)))


if __name__ == "__main__":
    unittest.main()
