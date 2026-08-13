import unittest

from backend.app.application.plan_revision import build_replan_request, revision_activation


class PlanRevisionApplicationTests(unittest.TestCase):
    def test_replan_request_normalizes_scope_and_task_ids(self):
        command = build_replan_request(
            week_id="2026-08-10",
            scope="unexpected",
            trigger="execution_interrupted",
            affected_task_ids=["task-b", "task-a", "task-b", ""],
            request_id="replan-1",
        )
        self.assertEqual(command["replan_scope"], "local")
        self.assertEqual(command["affected_task_ids"], ["task-a", "task-b"])

    def test_activation_preserves_history_and_retires_future_sessions(self):
        activation = revision_activation(week_id="2026-08-10", revision=4, plan_id="plan-4")
        self.assertEqual(activation.superseded_session_statuses, ("ready", "paused"))
        self.assertIn("running", activation.preserved_session_statuses)
        self.assertIn("ended", activation.preserved_session_statuses)
        self.assertIn("active_plan", activation.resource_names)


if __name__ == "__main__":
    unittest.main()
