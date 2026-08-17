import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from backend.humanos_server import Store


ROOT = Path(__file__).resolve().parents[1]


def legacy_frontend(name: str) -> str:
    path = ROOT / "frontend" / name
    if not path.exists():
        raise unittest.SkipTest("legacy static frontend was replaced by the Next.js application")
    return path.read_text(encoding="utf-8")


class ConfirmedExecutionRailTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = Path(self.tmp.name) / "humanos.db"
        self.store = Store(self.db)
        self.store.upsert_profile({
            "user_id": "u", "timezone": "Asia/Shanghai", "role": "student",
            "deep_work_window": "09:00-11:30",
            "weekly_context": {"week_id": "2026-08-03", "context_items": [], "keep_buffer": True},
        })
        task = self.store.create_task("u", {"title": "Analyze interviews", "due": "Friday 18:00", "duration": 60, "priority": "high"})
        self.task_id = task["id"]
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        self.block = {
            "block_id": "block-1", "task_id": self.task_id,
            "day_index": now.weekday(), "start": 9.0,
            "end": 10.0, "session_minutes": 60,
            "planned_work_minutes": 60,
            "start_at": (now + timedelta(minutes=30)).isoformat(),
            "end_at": (now + timedelta(minutes=90)).isoformat(),
        }
        proposal = self.store.save_proposed_plan("u", {"plan_patch": [self.block]}, {"week_id": "2026-08-03", "request_id": "proposal"})
        self.plan = self.store.confirm_plan("u", {
            "plan_id": proposal["plan_id"], "plan_revision": proposal["plan_revision"],
            "week_id": "2026-08-03", "plan_patch": [self.block], "unscheduled_tasks": [],
            "ai_task_analysis": {}, "decision": proposal,
        })["plan"]
        with self.store.connect() as conn:
            conn.execute(
                "UPDATE execution_sessions SET planned_start_at=?, planned_end_at=? WHERE user_id='u'",
                ((now + timedelta(minutes=30)).isoformat(), (now + timedelta(minutes=90)).isoformat()),
            )

    def tearDown(self):
        self.tmp.cleanup()

    def current(self):
        return self.store.current_execution("u")

    def start(self, request_id="start-1"):
        session = self.current()["session"]
        return self.store.start_execution_session("u", {"execution_session_id": session["execution_session_id"], "request_id": request_id})

    # Requested acceptance coverage (1-22).
    def test_01_confirmed_uses_execution_rail_not_review_copy(self):
        html = legacy_frontend("index.html")
        js = legacy_frontend("app.js")
        self.assertIn('id="executionRail"', html)
        self.assertIn('confirmed && !showingTask', js)

    def test_02_confirmed_header_has_one_state_badge(self):
        html = legacy_frontend("index.html")
        self.assertEqual(1, html.count('id="executionPlanState"'))

    def test_03_without_active_session_returns_up_next(self):
        self.assertEqual("up_next", self.current()["mode"])

    def test_04_due_start_time_without_click_remains_ready(self):
        session = self.current()["session"]
        past = (datetime.now(ZoneInfo("Asia/Shanghai")) - timedelta(minutes=1)).isoformat()
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET planned_start_at=? WHERE id=?", (past, session["execution_session_id"]))
        result = self.current()
        self.assertEqual(("ready_to_start", "ready"), (result["mode"], result["session"]["status"]))

    def test_05_start_keeps_one_execution_session(self):
        self.start("same-start")
        self.start("same-start")
        self.assertEqual(1, len(self.store.list_execution_sessions("u")))

    def test_06_start_marks_task_running(self):
        self.start()
        self.assertEqual("running", self.store.get_task(self.task_id, "u")["status"])

    def test_07_now_card_labels_both_remaining_values(self):
        js = legacy_frontend("app.js")
        self.assertIn("min left <small>in this session", js)
        self.assertIn("min remaining for the whole task", js)

    def test_08_refresh_restores_running_session(self):
        session = self.start()
        restored = Store(self.db).current_execution("u")
        self.assertEqual(("now", session["execution_session_id"]), (restored["mode"], restored["session"]["execution_session_id"]))

    def test_09_pause_accumulates_minutes_and_context_dump_is_preserved(self):
        session = self.start()
        paused = self.store.pause_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 18, "request_id": "pause-1"})
        dump = self.store.save_context_dump("u", {"task_id": self.task_id, "progress": "Coded two interviews", "next_action": "Code interview three", "stop_reason": "interrupted", "session_remaining_minutes": 42})
        self.assertEqual((18, "Code interview three"), (paused["accumulated_active_minutes"], dump["next_action"]))
        self.assertEqual(42, paused["task_remaining_minutes"])

    def test_context_dump_does_not_replace_task_remaining_with_session_remaining(self):
        session = self.start()
        self.store.patch_task(self.task_id, {"execution": {"remaining_duration_minutes": 105}}, "u")
        self.store.pause_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 15})
        before = self.store.get_task(self.task_id, "u")["execution"]["remaining_duration_minutes"]
        self.store.save_context_dump("u", {
            "task_id": self.task_id,
            "progress": "Coded one interview",
            "next_action": "Continue coding",
            "stop_reason": "interrupted",
            "session_remaining_minutes": 45,
        })
        after = self.store.get_task(self.task_id, "u")["execution"]["remaining_duration_minutes"]
        self.assertEqual(before, after)

    def test_context_dump_keeps_confirmed_plan_active(self):
        revision = self.store.ensure_profile("u").get("active_plan_revision")
        self.store.save_context_dump("u", {
            "task_id": self.task_id,
            "progress": "Coded one interview",
            "next_action": "Continue coding",
            "stop_reason": "interrupted",
        })
        active = self.store.active_plan("u", "2026-08-03")
        self.assertEqual("confirmed", active["plan_status"])
        self.assertEqual(revision, self.store.ensure_profile("u").get("active_plan_revision"))

    def test_10_resume_reuses_same_execution_session(self):
        session = self.start()
        self.store.pause_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 10})
        resumed = self.store.start_execution_session("u", {"execution_session_id": session["execution_session_id"], "request_id": "resume-1"})
        self.assertEqual(session["execution_session_id"], resumed["execution_session_id"])

    def test_11_timer_end_does_not_reduce_task_remaining(self):
        session = self.start()
        before = self.store.get_task(self.task_id, "u").get("execution", {}).get("remaining_duration_minutes")
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 30})
        after = self.store.get_task(self.task_id, "u").get("execution", {}).get("remaining_duration_minutes")
        self.assertEqual(before, after)

    def test_12_session_end_does_not_complete_task(self):
        session = self.start()
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 60})
        self.assertNotEqual("completed", self.store.get_task(self.task_id, "u")["status"])

    def test_13_partial_feedback_reduces_remaining_work(self):
        session = self.start()
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 20})
        self.store.save_execution_feedback("u", {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-partial", "task_evaluation": {"completion": "partial", "actual_minutes": 20}, "state_evaluation": {}, "recommendation_evaluation": {}})
        task = self.store.get_task(self.task_id, "u")
        self.assertEqual((40, "queued"), (task["execution"]["remaining_duration_minutes"], task["status"]))

    def test_14_did_not_start_keeps_remaining_work(self):
        session = self.start()
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 0})
        self.store.save_execution_feedback("u", {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-none", "task_evaluation": {"completion": "not_started", "actual_minutes": 30}, "state_evaluation": {}, "recommendation_evaluation": {}})
        task = self.store.get_task(self.task_id, "u")
        self.assertEqual((60, "queued", "not_started"), (task["execution"]["remaining_duration_minutes"], task["status"], self.store.list_execution_sessions("u")[0]["status"]))

    def test_15_selecting_another_task_keeps_compact_now_strip(self):
        js = legacy_frontend("app.js")
        self.assertIn("compact-running-strip", js)
        self.assertIn("data-return-now", js)

    def test_16_today_after_this_is_limited_to_two(self):
        js = legacy_frontend("app.js")
        self.assertIn(".slice(0, 2)", js)

    def test_17_buffer_defaults_to_compact_summary(self):
        html = legacy_frontend("index.html")
        self.assertIn("weeklyBufferSummary", html)
        self.assertIn("weeklyBufferDetails", html)

    def test_18_running_and_confirmed_blocks_do_not_float(self):
        css = legacy_frontend("styles.css")
        self.assertIn("execution-running", css)
        self.assertIn(":not(.pending):not(.suggested){animation:none}", css)

    def test_19_second_non_parallel_running_session_is_rejected(self):
        first = self.start()
        with self.store.connect() as conn:
            conn.execute("INSERT INTO execution_sessions (id,user_id,task_id,block_id,week_id,plan_revision,planned_start_at,planned_end_at,planned_work_minutes,status,created_at,updated_at) VALUES ('exec-2','u',?,'block-2','2026-08-03',1,?,?,30,'ready',1,1)", (self.task_id, self.block["start_at"], self.block["end_at"]))
        with self.assertRaises(ValueError):
            self.store.start_execution_session("u", {"execution_session_id": "exec-2", "request_id": "start-2"})
        self.assertEqual("running", first["status"])

    def test_20_confirmed_parallel_rule_requires_one_pair_only(self):
        js = legacy_frontend("app.js")
        self.assertIn("if (byTask.length !== 2) return", js)
        self.assertIn("confirmedParallelOverlapAllowed", js)

    def test_21_start_pause_and_feedback_requests_are_idempotent(self):
        session = self.start("start-idem")
        pause_payload = {"execution_session_id": session["execution_session_id"], "actual_minutes": 10, "request_id": "pause-idem"}
        first_pause = self.store.pause_execution_session("u", pause_payload)
        replayed_pause = self.store.pause_execution_session("u", pause_payload)
        self.assertEqual(first_pause["task_remaining_minutes"], replayed_pause["task_remaining_minutes"])
        feedback = {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-idem", "task_evaluation": {"completion": "partial", "actual_minutes": 10}, "state_evaluation": {}, "recommendation_evaluation": {}}
        first = self.store.save_execution_feedback("u", feedback)
        second = self.store.save_execution_feedback("u", feedback)
        with self.store.connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM execution_feedback WHERE user_id='u' AND request_id='feedback-idem'").fetchone()[0]
        self.assertEqual((first["id"], 1), (second["id"], count))

    def test_22_responsive_rules_keep_execution_controls_visible(self):
        css = legacy_frontend("styles.css")
        self.assertIn("@media (max-width:1180px)", css)
        self.assertIn("min-height:40px", css)
        self.assertIn("overflow-y:auto", css)


if __name__ == "__main__":
    unittest.main()
