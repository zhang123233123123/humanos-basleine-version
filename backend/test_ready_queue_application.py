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

    def test_planned_order_dominates_momentary_capacity(self) -> None:
        queue = build_ready_queue([
            {"execution_session_id": "earlier-hard", "task_id": "hard", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T09:00:00+08:00"},
            {"execution_session_id": "later-light", "task_id": "light", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T10:00:00+08:00"},
        ], {
            "hard": {"title": "Hard", "priority": "high", "task_demand": "high", "reentry_cost": "high"},
            "light": {"title": "Light", "priority": "low", "task_demand": "low", "reentry_cost": "low"},
        }, exclude_task_id="a", plan_revision=2, runtime_state={"focus": 2, "energy": 3, "stress": 6})
        self.assertEqual(["earlier-hard", "later-light"], [item["execution_session_id"] for item in queue])
        self.assertEqual("risky", queue[0]["scheduling_policy"]["fit"])

    def test_capacity_and_reentry_cost_break_only_true_ties(self) -> None:
        queue = build_ready_queue([
            {"execution_session_id": "high-cost", "task_id": "costly", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T09:00:00+08:00"},
            {"execution_session_id": "low-cost", "task_id": "easy", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T09:00:00+08:00"},
        ], {
            "costly": {"title": "Costly", "priority": "medium", "task_demand": "high", "reentry_cost": "high"},
            "easy": {"title": "Easy", "priority": "medium", "task_demand": "low", "reentry_cost": "low"},
        }, exclude_task_id="a", plan_revision=2, runtime_state={"focus": 2, "energy": 3, "stress": 6})
        self.assertEqual("low-cost", queue[0]["execution_session_id"])
        self.assertEqual(1, queue[0]["scheduling_policy"]["queue_position"])
        self.assertEqual("ready_queue_lexicographic_v2", queue[0]["scheduling_policy"]["policy_version"])

    def test_priority_dominates_capacity_when_start_times_tie(self) -> None:
        queue = build_ready_queue([
            {"execution_session_id": "high-risk", "task_id": "urgent", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T09:00:00+08:00"},
            {"execution_session_id": "low-fit", "task_id": "optional", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T09:00:00+08:00"},
        ], {
            "urgent": {"title": "Urgent", "priority": "high", "task_demand": {"level": "high"}},
            "optional": {"title": "Optional", "priority": "low", "task_demand": {"level": "low"}},
        }, exclude_task_id="a", plan_revision=2, runtime_state={"focus": 2, "energy": 3, "stress": 6})
        self.assertEqual("high-risk", queue[0]["execution_session_id"])
        self.assertEqual("risky", queue[0]["scheduling_policy"]["fit"])

    def test_equivalent_instants_sort_together_across_offsets(self) -> None:
        queue = build_ready_queue([
            {"execution_session_id": "utc", "task_id": "u", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T01:00:00+00:00"},
            {"execution_session_id": "shanghai", "task_id": "s", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T09:00:00+08:00"},
        ], {
            "u": {"priority": "low"},
            "s": {"priority": "high"},
        }, exclude_task_id="x", plan_revision=2, reference_now="2026-08-19T00:00:00+00:00")
        self.assertEqual(["shanghai", "utc"], [item["execution_session_id"] for item in queue])

    def test_aging_promotes_long_waiting_overdue_session_without_reordering_future_work(self) -> None:
        queue = build_ready_queue([
            {"execution_session_id": "old-low", "task_id": "old", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-17T09:00:00+08:00"},
            {"execution_session_id": "recent-high", "task_id": "recent", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-19T08:30:00+08:00"},
            {"execution_session_id": "future", "task_id": "future", "status": "ready", "plan_revision": 2, "planned_start_at": "2026-08-20T08:00:00+08:00"},
        ], {
            "old": {"priority": "low"},
            "recent": {"priority": "high"},
            "future": {"priority": "high"},
        }, exclude_task_id="x", plan_revision=2, reference_now="2026-08-19T09:00:00+08:00")
        self.assertEqual(["old-low", "recent-high", "future"], [item["execution_session_id"] for item in queue])
        self.assertGreater(queue[0]["scheduling_policy"]["aging_minutes"], 0)
        self.assertEqual("ready_queue_lexicographic_v2", queue[0]["scheduling_policy"]["policy_version"])


if __name__ == "__main__":
    unittest.main()
