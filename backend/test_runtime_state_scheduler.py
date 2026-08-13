import unittest

from backend.app.application.deterministic_scheduler import build_deterministic_plan


class RuntimeStateSchedulerTests(unittest.TestCase):
    def profile(self) -> dict:
        return {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T08:00:00+08:00",
            "deep_work_window": "09:00-11:30",
            "low_energy_window": "14:00-15:30",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "Monday 08:00-18:00",
                "context_items": [],
                "fixed_events": [],
                "temporary_constraints": [],
                "keep_buffer": False,
            },
        }

    def test_low_and_high_state_change_the_actual_first_session(self) -> None:
        tasks = [
            {"id": "deep", "title": "Analyze interviews", "due": "Monday 18:00", "duration": 90, "priority": "high", "expected_difficulty": 7, "status": "queued"},
            {"id": "light", "title": "Format references", "due": "Monday 18:00", "duration": 45, "priority": "medium", "expected_difficulty": 1, "status": "queued"},
        ]
        analysis = {"task_demands": [
            {"task_id": "deep", "level": "high"},
            {"task_id": "light", "level": "low"},
        ]}
        low = build_deterministic_plan(profile=self.profile(), tasks=tasks, analysis=analysis, payload={"runtime_state": {"focus": 2, "energy": 2, "stress": 6}})
        high = build_deterministic_plan(profile=self.profile(), tasks=tasks, analysis=analysis, payload={"runtime_state": {"focus": 7, "energy": 6, "stress": 3}})
        low_first = next(item for item in low["plan_patch"] if item.get("kind") == "task_session")
        high_first = next(item for item in high["plan_patch"] if item.get("kind") == "task_session")
        self.assertEqual("light", low_first["task_id"])
        self.assertEqual("deep", high_first["task_id"])
        self.assertLessEqual(low_first["planned_work_minutes"], 30)
        self.assertEqual("next_session_selection", low["state_decision"]["affected_decision"])

    def test_three_of_seven_is_treated_as_limited_capacity(self) -> None:
        tasks = [
            {"id": "deep", "title": "Analyze interviews", "due": "Monday 18:00", "duration": 90, "priority": "high", "expected_difficulty": 7, "status": "queued"},
            {"id": "light", "title": "Format references", "due": "Monday 18:00", "duration": 45, "priority": "medium", "expected_difficulty": 1, "status": "queued"},
        ]
        analysis = {"task_demands": [
            {"task_id": "deep", "level": "high"},
            {"task_id": "light", "level": "low"},
        ]}
        result = build_deterministic_plan(
            profile=self.profile(),
            tasks=tasks,
            analysis=analysis,
            payload={"runtime_state": {"focus": 3, "energy": 3, "stress": 5}},
        )
        first = next(item for item in result["plan_patch"] if item.get("kind") == "task_session")
        self.assertEqual("light", first["task_id"])
        self.assertLessEqual(first["planned_work_minutes"], 30)

    def test_daily_checkin_releases_only_todays_future_work(self) -> None:
        tasks = [
            {"id": "deep", "title": "Analyze interviews", "due": "Monday 18:00", "duration": 45, "priority": "high", "expected_difficulty": 7, "status": "queued"},
            {"id": "light", "title": "Format references", "due": "Monday 18:00", "duration": 45, "priority": "medium", "expected_difficulty": 1, "status": "queued"},
            {"id": "tomorrow", "title": "Prepare slides", "due": "Tuesday 18:00", "duration": 45, "priority": "high", "expected_difficulty": 5, "status": "queued"},
        ]
        existing = {"plan_patch": [
            {"block_id": "deep-old", "task_id": "deep", "kind": "task_session", "day_index": 0, "start": 9.0, "end": 9.75, "planned_work_minutes": 45},
            {"block_id": "light-old", "task_id": "light", "kind": "task_session", "day_index": 0, "start": 10.0, "end": 10.75, "planned_work_minutes": 45},
            {"block_id": "tomorrow-stable", "task_id": "tomorrow", "kind": "task_session", "day_index": 1, "start": 9.0, "end": 9.75, "planned_work_minutes": 45},
        ]}
        analysis = {"task_demands": [
            {"task_id": "deep", "level": "high"},
            {"task_id": "light", "level": "low"},
            {"task_id": "tomorrow", "level": "high"},
        ]}
        result = build_deterministic_plan(
            profile=self.profile(), tasks=tasks, analysis=analysis, existing_plan=existing,
            payload={"adjustment_trigger": "daily_checkin_changed_capacity", "runtime_state": {"focus": 2, "energy": 2, "stress": 6}},
        )
        work = [item for item in result["plan_patch"] if item.get("kind") == "task_session"]
        today = [item for item in work if item["day_index"] == 0]
        tomorrow = next(item for item in work if item["task_id"] == "tomorrow")
        self.assertEqual("light", today[0]["task_id"])
        self.assertEqual(("tomorrow-stable", 1, 9.0), (tomorrow["block_id"], tomorrow["day_index"], tomorrow["start"]))


if __name__ == "__main__":
    unittest.main()
