import unittest

from backend.app.domain.intent import classify_intent


class IntentClassifierTests(unittest.TestCase):
    def test_future_completion_is_add_task_not_progress(self) -> None:
        decision = classify_intent("我需要在周五晚上12点之前，完成我们的期末复习大概需要三个小时", "progress_update")
        self.assertEqual("add_task", decision.intent)
        self.assertTrue(decision.evidence.deadline)
        self.assertTrue(decision.evidence.estimated_duration)

    def test_explicit_completed_work_is_progress(self) -> None:
        self.assertEqual("progress_update", classify_intent("我刚刚已经完成了期末复习的一半").intent)

    def test_existing_meeting_change_is_reschedule(self) -> None:
        self.assertEqual("reschedule", classify_intent("把之前的组会改成明天下午两点").intent)

    def test_pause_is_interruption(self) -> None:
        self.assertEqual("interruption", classify_intent("这个任务先暂停，我现在不想继续做").intent)


if __name__ == "__main__":
    unittest.main()
