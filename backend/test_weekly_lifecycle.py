import tempfile
import unittest
from pathlib import Path

from backend.humanos_server import Store


class WeeklyLifecycleTests(unittest.TestCase):
    def make_store(self, path: Path) -> Store:
        store = Store(path)
        store.upsert_profile({
            "user_id": "u",
            "timezone": "Asia/Shanghai",
            "role": "student",
            "deep_work_window": "09:00-11:30",
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "周一至周日 08:00-21:00",
                "context_items": [],
                "keep_buffer": False,
            },
            "active_week_id": "2026-08-03",
        })
        return store

    def task_draft(self, **updates) -> dict:
        draft = {
            "title": "Analyze interview transcripts",
            "due": "周日 18:00前完成",
            "duration": 60,
            "priority": "高",
            "expected_difficulty": 6,
            "contextWindow": {
                "progress": "Two interviews coded",
                "nextStep": "Code the third interview",
            },
        }
        draft.update(updates)
        return draft

    def profile_patch(self, context_items=None) -> dict:
        return {
            "timezone": "Asia/Shanghai",
            "role": "student",
            "weekly_context": {
                "week_id": "2026-08-03",
                "weekly_available_windows": "周一至周日 08:00-21:00",
                "context_items": context_items or [],
                "keep_buffer": False,
            },
        }

    def test_weekly_edit_keeps_task_identity_and_context_history(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "identity.db")
            created = store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": self.profile_patch(), "tasks": [self.task_draft()]
            })
            task = store.list_tasks("u")[0]
            updated = store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03",
                "profile": self.profile_patch(),
                "tasks": [self.task_draft(id=task["id"], due="周日 20:00前完成", dependency="Review notes")],
            })
            current = next(item for item in store.list_tasks("u") if item["id"] == task["id"])
        self.assertEqual(task["id"], current["id"])
        self.assertEqual("Two interviews coded", current["contextWindow"]["progress"])
        self.assertEqual("Review notes", current["contextWindow"]["dependency"])
        self.assertIn("due", updated["task_diff"]["changes"][task["id"]])

    def test_removing_task_from_week_archives_instead_of_deleting(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "archive.db")
            created = store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": self.profile_patch(), "tasks": [self.task_draft()]
            })
            task_id = store.list_tasks("u")[0]["id"]
            result = store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": self.profile_patch(), "tasks": []
            })
            archived = next(item for item in store.list_tasks("u") if item["id"] == task_id)
        self.assertTrue(archived["removed_from_week"])
        self.assertIsNotNone(archived["archived_at"])

    def test_proposed_plan_request_is_idempotent_and_revisions_increment(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "plans.db")
            decision = {"plan_patch": [], "explanation": "test"}
            first = store.save_proposed_plan("u", decision, {"week_id": "2026-08-03", "request_id": "req-1"})
            replay = store.save_proposed_plan("u", decision, {"week_id": "2026-08-03", "request_id": "req-1"})
            second = store.save_proposed_plan("u", decision, {"week_id": "2026-08-03", "request_id": "req-2"})
        self.assertEqual(first["plan_id"], replay["plan_id"])
        self.assertEqual(first["plan_revision"] + 1, second["plan_revision"])

    def test_empty_plan_cannot_be_confirmed_with_active_work(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "empty-plan.db")
            store.create_task("u", {"title": "Write report", "due": "2026-08-16 18:00", "duration": 60})
            proposal = store.save_proposed_plan("u", {"plan_patch": [], "unscheduled_tasks": []}, {"week_id": "2026-08-10"})
            with self.assertRaisesRegex(ValueError, "没有任何可执行时间块"):
                store.confirm_plan("u", {"plan_id": proposal["plan_id"], "week_id": "2026-08-10", "plan_patch": [], "decision": proposal})

    def test_weekly_context_change_marks_confirmed_plan_for_update(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "invalidate.db")
            created = store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": self.profile_patch(), "tasks": [self.task_draft()]
            })
            task = store.list_tasks("u")[0]
            proposed = store.save_proposed_plan("u", {
                "plan_patch": [{"task_id": task["id"], "day_index": 6, "start": 9.0, "end": 10.0, "session_minutes": 60}]
            }, {"week_id": "2026-08-03", "request_id": "req-confirm"})
            store.confirm_plan("u", {
                "plan_id": proposed["plan_id"], "week_id": "2026-08-03", "plan_patch": proposed["plan_patch"],
                "unscheduled_tasks": [], "ai_task_analysis": {}, "decision": proposed,
            })
            changed_profile = self.profile_patch([{
                "id": "meeting", "type": "fixed_event", "title": "Meeting", "day": "周日",
                "days": [6], "start": 9.0, "end": 10.0,
            }])
            store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": changed_profile, "tasks": [self.task_draft(id=task["id"])]
            })
            active = store.active_plan("u", "2026-08-03")
        self.assertIsNotNone(active)
        self.assertEqual("needs_update", active["plan_status"])

    def test_daily_checkin_date_is_saved_on_profile(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "checkin.db")
            store.save_runtime_state("u", {
                "focus": 6, "energy": 5, "stress": 3, "emotion": "neutral",
                "daily_checkin": True, "local_date": "2026-08-06",
            })
            profile = store.ensure_profile("u")
        self.assertEqual("2026-08-06", profile["last_daily_checkin_date"])

    def test_rollover_reuses_routine_and_only_selected_unfinished_task(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "rollover.db")
            routine = {
                "id": "lunch", "type": "recurring_routine", "title": "Lunch",
                "occurrence_mode": "repeat_every_day", "day": "每天", "start": 12.0, "end": 13.0,
            }
            first = store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": self.profile_patch([routine]),
                "tasks": [self.task_draft(), self.task_draft(title="Write findings")],
            })
            carry_id = store.list_tasks("u")[0]["id"]
            result = store.rollover_week("u", {
                "week_id": "2026-08-10", "use_last_week": True, "carry_task_ids": [carry_id]
            })
            tasks = store.list_tasks("u")
            carried = next(item for item in tasks if item["id"] == carry_id)
            other = next(item for item in tasks if item["id"] != carry_id)
            rollover_profile = store.ensure_profile("u")
        self.assertEqual("2026-08-10", carried["week_id"])
        self.assertFalse(carried["removed_from_week"])
        self.assertTrue(other["removed_from_week"])
        self.assertEqual([routine], rollover_profile["weekly_context"]["context_items"])

    def test_rollover_always_keeps_long_term_context_and_drops_one_off_events(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = self.make_store(Path(temp_dir) / "persistent-context.db")
            weekly_class = {
                "id": "class", "type": "fixed_event", "title": "Seminar",
                "occurrence_mode": "repeat_weekly", "day": "Monday", "start": "10:00", "end": "11:00",
            }
            appointment = {
                "id": "appointment", "type": "fixed_event", "title": "Appointment",
                "occurrence_mode": "one_off", "day": "Tuesday", "start": "15:00", "end": "16:00",
            }
            store.reconcile_weekly_setup("u", {
                "week_id": "2026-08-03", "profile": self.profile_patch([weekly_class, appointment]), "tasks": [],
            })
            store.rollover_week("u", {
                "week_id": "2026-08-10", "use_last_week": False, "carry_task_ids": [],
            })
            context_items = store.ensure_profile("u")["weekly_context"]["context_items"]
        self.assertEqual([weekly_class], context_items)


if __name__ == "__main__":
    unittest.main()
