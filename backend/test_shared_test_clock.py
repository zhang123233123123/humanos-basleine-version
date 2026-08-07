import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import backend.humanos_server as server


class SharedTestClockTests(unittest.TestCase):
    def setUp(self):
        self.previous = (
            server.TEST_MODE,
            server._TEST_CLOCK_BASE,
            server._TEST_CLOCK_ANCHOR,
            server._TEST_CLOCK_SCALE,
        )
        server.TEST_MODE = True
        server._TEST_CLOCK_BASE = datetime.fromisoformat("2026-08-03T08:45:00+08:00")
        server._TEST_CLOCK_ANCHOR = time.monotonic()
        server._TEST_CLOCK_SCALE = 0

    def tearDown(self):
        (
            server.TEST_MODE,
            server._TEST_CLOCK_BASE,
            server._TEST_CLOCK_ANCHOR,
            server._TEST_CLOCK_SCALE,
        ) = self.previous

    def test_set_and_explicit_advances_are_deterministic(self):
        self.assertEqual("2026-08-03T08:45:00+08:00", server.clock_now().isoformat())
        state = server.update_test_clock({"advance_minutes": 15})
        self.assertEqual("2026-08-03T09:00:00+08:00", state["simulated_now"])
        state = server.update_test_clock({"advance_days": 7})
        self.assertEqual("2026-08-10", state["week_id"])

    def test_visual_scale_is_optional_and_explicit_mode_can_stop_it(self):
        server.update_test_clock({"time_scale": 15})
        self.assertEqual(15, server.test_clock_state()["time_scale"])
        server.update_test_clock(
            {"time_scale": 0, "set_time": "2026-08-03T08:59:00+08:00"},
            allow_backward=True,
        )
        self.assertEqual("2026-08-03T08:59:00+08:00", server.clock_now().isoformat())

    def test_backward_time_requires_an_independent_snapshot(self):
        server.update_test_clock({"advance_minutes": 15})
        with self.assertRaisesRegex(ValueError, "independent QA scenario snapshot"):
            server.update_test_clock({"set_time": "2026-08-03T08:45:00+08:00"})

    def test_execution_mode_reads_shared_clock_and_never_auto_starts(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = server.Store(Path(temp_dir) / "clock.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Singapore", "role": "student",
                "active_week_id": "2026-08-03",
                "weekly_context": {
                    "week_id": "2026-08-03",
                    "available_windows": [
                        {"day_index": day, "start": 0.0, "end": 24.0}
                        for day in range(7)
                    ],
                    "context_items": [],
                },
            })
            task = store.create_task("u", {"title": "System implementation", "due": "2026-08-07 18:00", "duration": 45})
            block = {"block_id": "clock-block", "task_id": task["id"], "day_index": 0, "start": 9, "end": 9.75, "session_minutes": 45}
            proposal = store.save_proposed_plan("u", {"plan_patch": [block]}, {"week_id": "2026-08-03", "request_id": "clock-plan"})
            store.confirm_plan("u", {"plan_id": proposal["plan_id"], "week_id": "2026-08-03", "plan_patch": [block], "decision": proposal})
            self.assertEqual("up_next", store.current_execution("u")["mode"])
            server.update_test_clock({"set_time": "2026-08-03T09:00:00+08:00"})
            current = store.current_execution("u")
            self.assertEqual(("ready_to_start", "ready"), (current["mode"], current["session"]["status"]))

    def test_event_timestamps_follow_simulated_time(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = server.Store(Path(temp_dir) / "events.db")
            store.ensure_profile("u")
            store.log_event("u", "clock_test", {})
            with store.connect() as conn:
                created = conn.execute("SELECT created_at FROM events WHERE user_id='u' ORDER BY created_at DESC LIMIT 1").fetchone()[0]
            expected = int(datetime.fromisoformat("2026-08-03T08:45:00+08:00").timestamp() * 1000)
            self.assertEqual(expected, created)

    def test_planning_tools_are_saved_as_research_control_only(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = server.Store(Path(temp_dir) / "profile.db")
            profile = store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Singapore",
                "research_context": {"planning_tools": [
                    {"tool_type": "digital_calendar", "tool_name": "Google Calendar", "frequency": "daily", "reliance": 5},
                    {"tool_type": "task_manager", "tool_name": "Notion", "frequency": "weekly", "reliance": 3},
                ]},
            })
            prompt_projection = {
                "deep_work_window": profile["deep_work_window"],
                "low_energy_window": profile["low_energy_window"],
                "weekly_context": profile["weekly_context"],
                "learned_patterns": profile["learned_patterns"],
            }
            self.assertEqual(2, len(profile["research_context"]["planning_tools"]))
            self.assertNotIn("planning_tools", prompt_projection)

    def test_new_plan_revision_retires_old_unstarted_sessions(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = server.Store(Path(temp_dir) / "revisions.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Singapore", "active_week_id": "2026-08-03",
                "weekly_context": {
                    "week_id": "2026-08-03", "keep_buffer": False,
                    "available_windows": [{"day_index": 0, "start": 8, "end": 18}],
                    "context_items": [],
                },
            })
            task = store.create_task("u", {"id": "T1", "title": "System implementation", "due": "2026-08-07 18:00", "duration": 45, "week_id": "2026-08-03"})
            first = {"block_id": "v1-block", "task_id": task["id"], "day_index": 0, "start": 9, "end": 9.75, "session_minutes": 45}
            v1 = store.save_proposed_plan("u", {"plan_patch": [first]}, {"week_id": "2026-08-03", "request_id": "v1"})
            store.confirm_plan("u", {"plan_id": v1["plan_id"], "edit_episode_id": v1["edit_episode_id"], "week_id": "2026-08-03", "plan_patch": [first], "decision": v1})
            second = {**first, "block_id": "v2-block", "start": 10, "end": 10.75}
            v2 = store.save_proposed_plan("u", {"plan_patch": [second]}, {"week_id": "2026-08-03", "request_id": "v2"})
            store.confirm_plan("u", {"plan_id": v2["plan_id"], "edit_episode_id": v2["edit_episode_id"], "week_id": "2026-08-03", "plan_patch": [second], "decision": v2})
            sessions = store.list_execution_sessions("u")
            self.assertEqual("superseded", next(item for item in sessions if item["plan_revision"] == 1)["status"])
            self.assertEqual("ready", next(item for item in sessions if item["plan_revision"] == 2)["status"])
            self.assertEqual(2, store.active_plan("u", "2026-08-03")["plan_revision"])

    def test_week_rollover_retires_old_ready_sessions(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = server.Store(Path(temp_dir) / "rollover.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Singapore", "active_week_id": "2026-08-03",
                "weekly_context": {
                    "week_id": "2026-08-03", "keep_buffer": False,
                    "available_windows": [{"day_index": 0, "start": 8, "end": 18}],
                    "context_items": [],
                },
            })
            task = store.create_task("u", {"id": "T1", "title": "Carry-over work", "due": "2026-08-07 18:00", "duration": 45, "week_id": "2026-08-03"})
            item = {"block_id": "old-week-block", "task_id": task["id"], "day_index": 0, "start": 9, "end": 9.75, "session_minutes": 45}
            plan = store.save_proposed_plan("u", {"plan_patch": [item]}, {"week_id": "2026-08-03"})
            store.confirm_plan("u", {"plan_id": plan["plan_id"], "edit_episode_id": plan["edit_episode_id"], "week_id": "2026-08-03", "plan_patch": [item], "decision": plan})
            store.rollover_week("u", {"week_id": "2026-08-10", "use_last_week": True, "carry_task_ids": [task["id"]]})
            self.assertEqual("superseded", store.list_execution_sessions("u")[0]["status"])
            self.assertEqual("2026-08-10", store.get_task("T1", "u")["week_id"])


if __name__ == "__main__":
    unittest.main()
