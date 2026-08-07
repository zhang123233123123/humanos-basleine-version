import unittest
from datetime import datetime

from backend.humanos_graph import build_scheduling_context, day_index_from_due, scheduler_node


class SchedulerConstraintTests(unittest.TestCase):
    def profile(self) -> dict:
        return {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T07:00:00+08:00",
            "deep_work_window": "09:00-11:30",
            "low_energy_window": "14:00-15:30",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 10},
            "weekly_context": {
                "weekly_available_windows": "周二 08:00-21:00；周三 08:00-18:00；周四 08:00-18:00",
                "temporary_constraints": ["周二 14:00-17:00 外出"],
                "fixed_events": [],
                "keep_buffer": False,
            },
        }

    def test_fixed_event_keeps_original_time_when_constraint_conflicts(self) -> None:
        task = {
            "id": "meeting",
            "title": "开组会",
            "task_type": "fixed_event",
            "due": "周二 15:00",
            "duration": 60,
            "priority": "中",
            "status": "queued",
        }
        result = scheduler_node(None)({
            "tasks": [task],
            "profile": self.profile(),
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {},
        })

        block = result["plan_patch"][0]
        self.assertEqual(15.0, block["start"])
        self.assertEqual(16.0, block["end"])
        self.assertTrue(block["constraint_conflict"])
        self.assertFalse(result["validation"]["valid"])
        self.assertIn("fixed event was not moved", block["constraint_evidence"][-1])

    def test_deadline_without_clock_uses_last_available_window(self) -> None:
        result = scheduler_node(None)({
            "tasks": [{
                "id": "paper",
                "title": "修改实验设计",
                "task_type": "flexible_task",
                "due": "周四前完成",
                "duration": 120,
                "priority": "高",
                "status": "queued",
            }],
            "profile": self.profile(),
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {},
        })
        needs = result["joint_state"]["task_environment_state"]["needs_clarification"]
        self.assertEqual([], needs)
        self.assertTrue(result["plan_patch"])
        self.assertTrue(all(block["day_index"] <= 3 for block in result["plan_patch"]))
        assumptions = result["constraint_summary"]["default_assumptions"]
        self.assertTrue(any(item.get("task_id") == "paper" for item in assumptions))

    def test_ai_activity_without_duration_requires_confirmation_but_not_a_time_range(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["fixed_events"] = ["可移动 周三 健身"]
        context = build_scheduling_context(profile)
        self.assertEqual(0, len(context["flexible_activity_blocks"]))
        self.assertTrue(any("预计时长" in item for item in context["uncertain_constraints"]))

    def test_ai_activity_with_day_and_duration_uses_available_window(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["context_items"] = [{
            "id": "ctx-gym-auto",
            "type": "flexible_activity",
            "title": "健身",
            "day": "周三",
            "days": [2],
            "duration_minutes": 60,
            "confirmed": True,
        }]
        context = build_scheduling_context(profile)
        blocks = [item for item in context["flexible_activity_blocks"] if item.get("source_type") == "flexible_activity"]
        self.assertEqual(1, len(blocks))
        self.assertEqual(2, blocks[0]["day_index"])
        self.assertEqual(60, round((blocks[0]["end"] - blocks[0]["start"]) * 60))
        self.assertIn("AI 根据可用时间", blocks[0]["evidence"])

    def test_lunch_routine_uses_visible_low_confidence_default_and_is_not_hard(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["fixed_events"] = ["日常 午饭"]
        context = build_scheduling_context(profile)
        self.assertEqual([], [item for item in context["hard_constraints"] if item.get("source_type") == "recurring_routine"])
        routines = context["routine_blocks"]
        self.assertEqual(7, len(routines))
        self.assertTrue(all(item["start"] == 12.0 and item["end"] == 13.0 for item in routines))
        self.assertTrue(all(item["availability_window"] == {"start": 11.5, "end": 13.5} for item in routines))
        self.assertTrue(all(item["confidence"] == "low" for item in routines))

    def test_structured_ai_activity_stays_inside_user_range(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["context_items"] = [{
            "id": "ctx-gym",
            "type": "flexible_activity",
            "category": "flexible_activity",
            "title": "健身",
            "day": "周三",
            "days": [2],
            "start": 17.0,
            "end": 21.0,
            "duration_minutes": 60,
            "confirmed": True,
        }]
        context = build_scheduling_context(profile)
        self.assertEqual(1, len(context["flexible_activity_blocks"]))
        block = context["flexible_activity_blocks"][0]
        self.assertEqual(2, block["day_index"])
        self.assertGreaterEqual(block["start"], 17.0)
        self.assertLessEqual(block["end"], 21.0)
        self.assertEqual("ctx-gym", block["context_id"])

    def test_fixed_event_adds_visible_recovery_transition(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["fixed_events"] = ["固定 周三 10:00-11:00 组会"]
        context = build_scheduling_context(profile)
        recovery = [item for item in context["flexible_activity_blocks"] if item.get("source_type") == "recovery_transition"]
        self.assertEqual(1, len(recovery))
        self.assertEqual(11.0, recovery[0]["start"])
        self.assertEqual(11.25, recovery[0]["end"])

    def test_relative_fixed_event_is_kept_at_its_stated_time(self) -> None:
        expected_day = datetime.now().weekday() + 1
        if expected_day > 6:
            self.skipTest("明天已经进入下一周")
        profile = self.profile()
        profile["weekly_context"]["temporary_constraints"] = []
        result = scheduler_node(None)({
            "tasks": [{
                "id": "tomorrow-meeting",
                "title": "开组会",
                "task_type": "fixed_event",
                "due": "明天下午3点",
                "duration": 60,
                "priority": "中",
                "status": "queued",
            }],
            "profile": profile,
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {},
        })
        self.assertEqual(expected_day, day_index_from_due("明天下午3点"))
        self.assertEqual(1, len(result["plan_patch"]))
        self.assertEqual("fixed_event", result["plan_patch"][0]["kind"])
        self.assertEqual(15.0, result["plan_patch"][0]["start"])

    def test_dependency_finishes_before_successor_starts(self) -> None:
        profile = self.profile()
        tasks = [
            {"id": "foundation", "title": "系统搭建", "task_type": "flexible_task", "due": "周四 18:00", "duration": 180, "priority": "高", "status": "queued"},
            {"id": "experiment", "title": "实验设计", "task_type": "flexible_task", "due": "周五 18:00", "duration": 120, "priority": "高", "status": "queued"},
        ]
        result = scheduler_node(None)({
            "tasks": tasks,
            "profile": profile,
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {
                "dependencies": [{
                    "before_task_id": "foundation",
                    "after_task_id": "experiment",
                    "reason": "实验依赖系统",
                    "confidence_level": "high",
                    "hard_enforced": True,
                }]
            },
        })
        foundation = [block for block in result["plan_patch"] if block["task_id"] == "foundation"]
        experiment = [block for block in result["plan_patch"] if block["task_id"] == "experiment"]
        self.assertTrue(foundation)
        self.assertTrue(experiment)
        self.assertLessEqual(
            max((block["day_index"], block["end"]) for block in foundation),
            min((block["day_index"], block["start"]) for block in experiment),
        )
        self.assertNotIn("dependency_order", [item["type"] for item in result["validation"]["violations"]])

    def test_inferred_medium_dependency_is_not_hard_enforced(self) -> None:
        tasks = [
            {"id": "a", "title": "任务 A", "task_type": "flexible_task", "due": "周四 18:00", "duration": 60, "priority": "中", "status": "queued"},
            {"id": "b", "title": "任务 B", "task_type": "flexible_task", "due": "周四 18:00", "duration": 60, "priority": "中", "status": "queued"},
        ]
        result = scheduler_node(None)({
            "tasks": tasks,
            "profile": self.profile(),
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {"dependencies": [{
                "before_task_id": "a", "after_task_id": "b", "confidence_level": "medium", "hard_enforced": False
            }]},
        })
        self.assertTrue(result["plan_patch"])
        self.assertNotIn("dependency_order", [item["type"] for item in result["validation"]["violations"]])

    def test_long_task_does_not_use_short_fragments_when_full_sessions_exist(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["temporary_constraints"] = []
        result = scheduler_node(None)({
            "tasks": [{
                "id": "long-task",
                "title": "完成系统实现",
                "task_type": "flexible_task",
                "due": "周五 18:00",
                "duration": 300,
                "priority": "高",
                "status": "queued",
            }],
            "profile": profile,
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {},
        })
        sessions = [block["session_minutes"] for block in result["plan_patch"] if block["kind"] == "task_session"]
        starts = [block["start"] for block in result["plan_patch"] if block["kind"] == "task_session"]
        self.assertEqual(300, sum(sessions))
        self.assertTrue(all(minutes >= 30 for minutes in sessions))
        self.assertTrue(all(abs(start * 4 - round(start * 4)) < 1e-6 for start in starts))
        ends = [block["end"] for block in result["plan_patch"] if block["kind"] == "task_session"]
        self.assertTrue(all(abs(end * 4 - round(end * 4)) < 1e-6 for end in ends))
        self.assertTrue(all(minutes % 15 == 0 for minutes in sessions))

    def test_resumed_task_schedules_actual_remaining_work_only(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["temporary_constraints"] = []
        result = scheduler_node(None)({
            "tasks": [{
                "id": "resumed-task",
                "title": "继续系统实现",
                "task_type": "flexible_task",
                "due": "周五 18:00",
                "duration": 300,
                "execution": {"remaining_duration_minutes": 75, "accumulated_actual_minutes": 225},
                "priority": "高",
                "status": "queued",
            }],
            "profile": profile,
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5},
            "ai_task_analysis": {},
        })
        sessions = [block["session_minutes"] for block in result["plan_patch"] if block["task_id"] == "resumed-task"]
        self.assertEqual(75, sum(sessions))

    def test_balanced_candidate_has_lowest_daily_load_variance(self) -> None:
        profile = self.profile()
        profile["weekly_context"]["temporary_constraints"] = []
        tasks = [
            {"id": "a", "title": "系统搭建", "task_type": "flexible_task", "due": "周三 18:00", "duration": 300, "priority": "高", "status": "queued"},
            {"id": "b", "title": "实验设计", "task_type": "flexible_task", "due": "周四 18:00", "duration": 200, "priority": "中", "status": "queued"},
            {"id": "c", "title": "文献阅读", "task_type": "flexible_task", "due": "周四 18:00", "duration": 120, "priority": "中", "status": "queued"},
        ]
        result = scheduler_node(None)({
            "tasks": tasks, "profile": profile,
            "runtime_state": {"focus": 5, "energy": 4, "stress": 5}, "ai_task_analysis": {},
        })
        metrics = {candidate["id"]: candidate["metrics"] for candidate in result["candidate_plans"]}
        signatures = [tuple((block["task_id"], block["day_index"], block["start"], block["end"]) for block in candidate["plan_patch"]) for candidate in result["candidate_plans"]]
        self.assertEqual(len(signatures), len(set(signatures)))
        if "balanced" in metrics:
            self.assertLessEqual(metrics["balanced"]["daily_load_variance"], metrics["energy_fit"]["daily_load_variance"])
            if "deadline_first" in metrics:
                self.assertLessEqual(metrics["balanced"]["daily_load_variance"], metrics["deadline_first"]["daily_load_variance"])
            self.assertGreaterEqual(metrics["energy_fit"]["cognitive_fit_score"], metrics["balanced"]["cognitive_fit_score"])
        if "deadline_first" in metrics:
            self.assertGreaterEqual(metrics["energy_fit"]["cognitive_fit_score"], metrics["deadline_first"]["cognitive_fit_score"])


if __name__ == "__main__":
    unittest.main()
