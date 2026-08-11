import tempfile
import unittest
from unittest.mock import patch
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from backend.humanos_server import Store, parse_clock_hour, safe_duration_minutes


class TaskInputLayerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp_dir.name) / "humanos-test.db")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_duration_only_fragments_belong_to_previous_task(self) -> None:
        tasks = self.store.local_parse_tasks_from_text(
            "user-a",
            "明天下午三点开组会，持续1小时；周三前写完论文，预计3小时。",
        )

        self.assertEqual(2, len(tasks))
        self.assertEqual(60, tasks[0]["duration"])
        self.assertNotIn("持续", tasks[0]["title"])
        self.assertEqual("fixed_event", tasks[0]["task_type"])
        self.assertEqual(180, tasks[1]["duration"])
        self.assertEqual("写完论文", tasks[1]["title"])
        self.assertEqual("flexible_task", tasks[1]["task_type"])

    def test_parse_preview_does_not_create_tasks(self) -> None:
        previews = self.store.local_parse_tasks_from_text(
            "user-a",
            "周三前整理访谈结果",
            create_tasks=False,
        )
        self.assertEqual(1, len(previews))
        self.assertTrue(previews[0]["is_preview"])
        self.assertIsNone(previews[0]["duration"])
        self.assertIn("duration_minutes", previews[0]["missing_fields"])
        self.assertEqual([], self.store.list_tasks("user-a"))

    def test_confirmed_task_preserves_absolute_temporal_metadata(self) -> None:
        task = self.store.create_task("user-a", {
            "title": "提交报告",
            "due": "2026-08-07 17:00",
            "duration": 30,
            "timezone": "Asia/Shanghai",
            "deadline_at": "2026-08-07T09:00:00.000Z",
            "deadline_assumption": None,
        })
        self.assertEqual("Asia/Shanghai", task["timezone"])
        self.assertEqual("2026-08-07T09:00:00.000Z", task["deadline_at"])

    def test_english_tasks_are_split(self) -> None:
        tasks = self.store.local_parse_tasks_from_text(
            "user-a",
            "I need to finish the paper, and I also need to prepare the presentation.",
        )

        self.assertEqual(2, len(tasks))
        self.assertIn("paper", tasks[0]["title"].lower())
        self.assertIn("presentation", tasks[1]["title"].lower())
        self.assertEqual(2, self.store.estimated_task_count(
            "I need to finish the paper, and I also need to prepare the presentation."
        ))

    def test_numbered_english_task_list_is_parsed(self) -> None:
        text = """Please add these tasks for this week:

1. Analyze interview transcripts, 150 minutes, high priority, due Wednesday at 18:00.
2. Revise the literature review, 120 minutes, high priority, due Thursday at 17:00.
3. Prepare a supervisor update, 45 minutes, high priority, due Thursday at 18:00.
4. Create a findings diagram, 75 minutes, medium priority, due Friday at 15:00.
5. Write the findings section, 120 minutes, high priority, due Saturday at 13:00.
6. Format references and figures, 45 minutes, low priority, due Saturday at 14:00.
7. Do the laundry, 45 minutes, low priority, due Saturday at 18:00.
8. Listen to an English research podcast, 30 minutes, low priority, due Saturday at 18:00."""

        existing = self.store.create_task("user-a", {
            "title": "Existing task",
            "due": "today 12:00",
            "duration": 60,
        })
        updates = self.store.parse_time_followup_for_recent_tasks(
            "user-a",
            text,
            {"recent_tasks": [existing]},
        )
        tasks = self.store.local_parse_tasks_from_text("user-a", text, create_tasks=False)

        self.assertEqual([], updates)
        self.assertEqual(8, len(tasks))
        self.assertEqual([150, 120, 45, 75, 120, 45, 45, 30], [task["duration"] for task in tasks])
        self.assertEqual(["高", "高", "高", "中", "高", "低", "低", "低"], [task["priority"] for task in tasks])
        deadlines = [datetime.fromisoformat(task["deadline_at"]) for task in tasks]
        self.assertEqual([2, 3, 3, 4, 5, 5, 5, 5], [deadline.weekday() for deadline in deadlines])
        self.assertEqual([(18, 0), (17, 0), (18, 0), (15, 0), (13, 0), (14, 0), (18, 0), (18, 0)], [(deadline.hour, deadline.minute) for deadline in deadlines])
        self.assertTrue(all(task["timezone"] == "Asia/Shanghai" for task in tasks))

    def test_numbered_list_ignores_model_wide_duration_copy(self) -> None:
        text = """1. Analyze interview transcripts, 150 minutes, high priority, due Wednesday at 18:00.
2. Revise the literature review, 120 minutes, high priority, due Thursday at 17:00.
3. Prepare a supervisor update, 45 minutes, high priority, due Thursday at 18:00."""
        bad_model_result = [
            {"title": title, "duration_minutes": 150, "schedule_type": "flexible_task"}
            for title in ("Analyze interview transcripts", "Revise the literature review", "Prepare a supervisor update")
        ]
        with patch("backend.humanos_server.parse_tasks_with_agent", return_value=bad_model_result):
            tasks = self.store.parse_tasks_from_text("user-a", text, create_tasks=False)
        self.assertEqual([150, 120, 45], [task["duration"] for task in tasks])

    def test_expanded_action_keywords_are_not_dropped(self) -> None:
        tasks = self.store.local_parse_tasks_from_text(
            "user-a",
            "发邮件给导师；取快递；总结访谈结果；submit assignment",
        )
        self.assertEqual(4, len(tasks))

    def test_compact_timed_task_list_does_not_reschedule_recent_task(self) -> None:
        existing = self.store.create_task("user-a", {
            "title": "睡觉打豆",
            "due": "今天 24:00",
            "duration": 60,
        })
        text = "我明天10:00开会，11:00写作业都是一个小时"

        updated = self.store.parse_time_followup_for_recent_tasks(
            "user-a",
            text,
            {"recent_tasks": [existing]},
        )
        previews = self.store.local_parse_tasks_from_text(
            "user-a",
            text,
            create_tasks=False,
        )

        self.assertEqual([], updated)
        self.assertEqual(2, len(previews))
        self.assertEqual("开会", previews[0]["title"])
        self.assertEqual("写作业", previews[1]["title"])
        self.assertEqual([60, 60], [item["duration"] for item in previews])

    def test_chinese_analysis_list_does_not_reschedule_recent_task(self) -> None:
        existing = self.store.create_task("user-a", {"title": "旧任务", "due": "今天 12:00", "duration": 60})
        text = "周三18:00前分析访谈材料，预计120分钟，高优先级；周五15:00前完成研究图，预计75分钟，中优先级。"

        updated = self.store.parse_time_followup_for_recent_tasks(
            "user-a", text, {"recent_tasks": [existing]},
        )

        self.assertEqual([], updated)

    def test_explicit_single_task_reschedule_still_updates_recent_task(self) -> None:
        meeting = self.store.create_task("user-a", {
            "title": "组会",
            "due": "明天 10:00",
            "duration": 60,
        })

        updated = self.store.parse_time_followup_for_recent_tasks(
            "user-a",
            "把组会改成明天14:00",
            {"recent_tasks": [meeting]},
        )

        self.assertEqual(1, len(updated))
        self.assertEqual("明天 14:00", updated[0]["due"])

    def test_exact_dedup_is_user_scoped(self) -> None:
        payload = {"title": "完成  论文", "due": "周三", "duration": 90}
        first = self.store.create_task("user-a", payload)
        duplicate = self.store.create_task(
            "user-a",
            {"title": "完成 论文", "due": " 周三 ", "duration": 90},
        )
        other_user = self.store.create_task("user-b", payload)

        self.assertEqual(first["id"], duplicate["id"])
        self.assertNotEqual(first["id"], other_user["id"])
        self.assertEqual(1, len(self.store.list_tasks("user-a")))

    def test_task_reads_writes_and_deletes_require_owner(self) -> None:
        task = self.store.create_task(
            "user-a",
            {"title": "周一15:00开组会", "due": "周一15:00", "duration": 60},
        )

        self.assertIsNone(self.store.get_task(task["id"], "user-b"))
        with self.assertRaises(KeyError):
            self.store.patch_task(task["id"], {"title": "越权修改"}, "user-b")
        with self.assertRaises(KeyError):
            self.store.delete_task(task["id"], "user-b")
        self.assertEqual(task["id"], self.store.get_task(task["id"], "user-a")["id"])

    def test_interruption_preserves_remaining_work_and_reentry_step(self) -> None:
        task = self.store.create_task(
            "user-a",
            {"title": "完成论文方法", "due": "周五 18:00", "duration": 120},
        )
        self.store.save_context_dump("user-a", {
            "task_id": task["id"],
            "stop_reason": "interrupted",
            "progress": "已经完成研究问题部分",
            "next_action": "补充方法选择的理由",
            "remaining_duration_minutes": 75,
            "progress_percent": 38,
        })

        paused = self.store.get_task(task["id"], "user-a")
        self.assertEqual("paused", paused["status"])
        self.assertEqual(75, paused["execution"]["remaining_duration_minutes"])
        self.assertEqual(38, paused["execution"]["progress_percent"])

        reentry = self.store.reentry_prompt("user-a", {
            "task_id": task["id"],
            "runtime_state": {"focus": 5, "energy": 4, "stress": 4},
        })
        self.assertEqual("补充方法选择的理由", reentry["first_step"])
        self.assertEqual("已经完成研究问题部分", reentry["previous_progress"])
        self.assertEqual(75, reentry["remaining_duration_minutes"])

    def test_blocked_interruption_uses_blocked_status(self) -> None:
        task = self.store.create_task(
            "user-a",
            {"title": "等待导师回复", "due": "周五 18:00", "duration": 30},
        )
        self.store.save_context_dump("user-a", {
            "task_id": task["id"],
            "stop_reason": "blocked",
            "progress": "问题已经发送",
            "next_action": "收到回复后更新实验参数",
            "remaining_duration_minutes": 30,
        })
        self.assertEqual("blocked", self.store.get_task(task["id"], "user-a")["status"])

    def test_zero_remaining_work_is_not_replaced_by_original_duration(self) -> None:
        task = self.store.create_task(
            "user-a",
            {"title": "提交最终报告", "due": "周五 18:00", "duration": 60},
        )
        self.store.save_context_dump("user-a", {
            "task_id": task["id"],
            "stop_reason": "interrupted",
            "progress": "报告内容已经完成",
            "next_action": "只需确认是否提交成功",
            "remaining_duration_minutes": 0,
            "progress_percent": 100,
        })
        saved = self.store.get_task(task["id"], "user-a")
        self.assertEqual(0, saved["execution"]["remaining_duration_minutes"])
        self.assertEqual(100, saved["execution"]["progress_percent"])
        reentry = self.store.reentry_prompt("user-a", {
            "task_id": task["id"],
            "runtime_state": {"focus": 5, "energy": 4, "stress": 4},
        })
        self.assertEqual(0, reentry["remaining_duration_minutes"])

    def test_store_connection_is_closed_after_context_exit(self) -> None:
        with self.store.connect() as connection:
            connection.execute("SELECT 1").fetchone()

        with self.assertRaises(sqlite3.ProgrammingError):
            connection.execute("SELECT 1")

    def test_chinese_clock_and_duration_are_normalized(self) -> None:
        self.assertEqual(14.0, parse_clock_hour("下午两点"))
        self.assertEqual(18.5, parse_clock_hour("十八点半"))
        self.assertEqual(38, safe_duration_minutes(38))

    def test_named_meeting_can_be_rescheduled_in_chinese(self) -> None:
        meeting = self.store.create_task("user-a", {
            "title": "组会",
            "task_type": "fixed_event",
            "due": "明天 10:00",
            "duration": 60,
            "priority": "中",
        })
        updated = self.store.parse_time_followup_for_recent_tasks(
            "user-a",
            "我明天的任务想改一下，我的组会变成下午两点了",
            {"recent_tasks": [meeting]},
        )
        self.assertEqual(1, len(updated))
        self.assertEqual("明天 14:00", updated[0]["due"])
        self.assertEqual(60, updated[0]["duration"])

    def test_weekly_context_meeting_update_does_not_create_task(self) -> None:
        account = self.store.create_user("context@example.com", "secret123", "Context User")
        user_id = account["user"]["id"]
        profile = self.store.ensure_profile(user_id)
        profile["weekly_context"]["context_items"] = [{
            "id": "ctx-meeting",
            "type": "fixed_event",
            "category": "occupied_time",
            "title": "组会",
            "day": "周三",
            "days": [2],
            "start": 10.0,
            "end": 11.0,
            "duration_minutes": 60,
            "confirmed": True,
        }]
        self.store.upsert_profile(profile)
        turn = self.store.chat_turn(user_id, {"text": "我的组会变成下午两点了"})
        self.assertEqual("update_weekly_context", turn["intent"])
        self.assertEqual([], turn["tasks"])
        self.assertIn("will not search for another position", turn["reply"])
        item = turn["weekly_context"]["context_items"][0]
        self.assertEqual(14.0, item["start"])
        self.assertEqual(15.0, item["end"])

    def test_english_meeting_change_updates_weekly_context_not_recent_task(self) -> None:
        account = self.store.create_user("english-context@example.com", "secret123", "Context User")
        user_id = account["user"]["id"]
        profile = self.store.ensure_profile(user_id)
        profile["weekly_context"]["context_items"] = [{
            "id": "ctx-research-meeting",
            "type": "fixed_event",
            "category": "fixed_event",
            "title": "research meeting",
            "day": "周五",
            "days": [4],
            "start": 10.0,
            "end": 11.0,
            "duration_minutes": 60,
            "confirmed": True,
        }]
        self.store.upsert_profile(profile)
        unrelated = self.store.create_task(user_id, {
            "title": "Analyze interview transcripts",
            "due": "Saturday 14:00",
            "duration": 60,
            "context": "Added from Weekly Setup.",
        })
        self.store.save_chat_turn(user_id, "Add this task", "Added", "add_task", {}, [unrelated["id"]])

        turn = self.store.chat_turn(user_id, {"text": "My research meeting tomorrow has moved to 14:00–15:00."})

        expected_day = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][(datetime.now().astimezone() + timedelta(days=1)).weekday()]
        item = turn["weekly_context"]["context_items"][0]
        unchanged_task = self.store.get_task(unrelated["id"], user_id)
        self.assertEqual("update_weekly_context", turn["intent"])
        self.assertEqual([], turn["tasks"])
        self.assertEqual(expected_day, item["day"])
        self.assertEqual([14.0, 15.0], [item["start"], item["end"]])
        self.assertEqual("Saturday 14:00", unchanged_task["due"])
        self.assertEqual("Added from Weekly Setup.", unchanged_task["context"])

    def test_weekly_routine_chat_update_keeps_soft_constraint_semantics(self) -> None:
        account = self.store.create_user("routine@example.com", "secret123", "Routine User")
        user_id = account["user"]["id"]
        profile = self.store.ensure_profile(user_id)
        profile["weekly_context"]["context_items"] = [{
            "id": "ctx-lunch",
            "type": "recurring_routine",
            "category": "recurring_routine",
            "title": "午饭",
            "day": "每天",
            "days": list(range(7)),
            "start": 12.0,
            "end": 13.0,
            "duration_minutes": 60,
            "shift_minutes": 30,
            "confirmed": True,
        }]
        self.store.upsert_profile(profile)
        turn = self.store.chat_turn(user_id, {"text": "我的午饭改成下午一点了"})
        self.assertEqual("update_weekly_context", turn["intent"])
        self.assertEqual([], turn["tasks"])
        self.assertIn("routine window", turn["reply"])
        item = turn["weekly_context"]["context_items"][0]
        self.assertEqual("recurring_routine", item["type"])
        self.assertEqual(13.0, item["start"])
        self.assertEqual(30, item["shift_minutes"])


if __name__ == "__main__":
    unittest.main()
