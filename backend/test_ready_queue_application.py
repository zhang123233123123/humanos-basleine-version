import unittest

from backend.app.application.ready_queue import build_ready_queue


class ReadyQueueApplicationTests(unittest.TestCase):
    def test_queue_excludes_paused_task_and_other_revisions(self) -> None:
        queue = build_ready_queue([
            {"execution_session_id": "same", "task_id": "a", "status": "ready", "plan_revision": 2},
            {"execution_session_id": "candidate", "task_id": "b", "status": "ready", "plan_revision": 2},
            {"execution_session_id": "old", "task_id": "c", "status": "ready", "plan_revision": 1},
        ], {"b": {"title": "Task B"}, "c": {"title": "Task C"}}, exclude_task_id="a", plan_revision=2)
        self.assertEqual(["candidate"], [item["execution_session_id"] for item in queue])

    def test_hard_blocked_dependency_is_not_ready(self) -> None:
        queue = build_ready_queue([{"execution_session_id": "blocked", "task_id": "b", "status": "ready", "plan_revision": 2}], {"b": {"title": "B", "dependency": {"hard_blocked": True}}}, exclude_task_id="a", plan_revision=2)
        self.assertEqual([], queue)


if __name__ == "__main__":
    unittest.main()
