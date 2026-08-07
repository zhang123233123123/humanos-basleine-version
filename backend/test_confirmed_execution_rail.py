import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from backend.humanos_server import Store


ROOT = Path(__file__).resolve().parents[1]


class ConfirmedExecutionRailTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = Path(self.tmp.name) / "humanos.db"
        self.store = Store(self.db)
        self.store.upsert_profile({
            "user_id": "u", "timezone": "Asia/Shanghai", "role": "student",
            "deep_work_window": "09:00-11:30",
            "weekly_context": {
                "week_id": "2026-08-03",
                "available_windows": [
                    {"day_index": day, "start": 0.0, "end": 24.0}
                    for day in range(7)
                ],
                "context_items": [],
                "keep_buffer": True,
            },
        })
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        task = self.store.create_task("u", {"title": "Analyze interviews", "due": f"{now.date().isoformat()} 18:00", "duration": 60, "priority": "high"})
        self.task_id = task["id"]
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
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="executionRail"', html)
        self.assertIn('confirmed && !showingTask', js)

    def test_02_confirmed_header_has_one_state_badge(self):
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
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
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("min left <small>in this session", js)
        self.assertIn("min remaining for the whole task", js)

    def test_08_refresh_restores_running_session(self):
        session = self.start()
        restored = Store(self.db).current_execution("u")
        self.assertEqual(("now", session["execution_session_id"]), (restored["mode"], restored["session"]["execution_session_id"]))

    def test_09_pause_accumulates_minutes_and_context_dump_is_preserved(self):
        session = self.start()
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        paused = self.store.pause_execution_session("u", {"execution_session_id": session["execution_session_id"], "paused_at": (base + timedelta(minutes=18)).isoformat(), "request_id": "pause-1"})
        dump = self.store.save_context_dump("u", {"task_id": self.task_id, "progress": "Coded two interviews", "next_action": "Code interview three", "stop_reason": "interrupted"})
        self.assertEqual((18, "Code interview three", 60), (paused["accumulated_active_minutes"], dump["next_action"], self.store.get_task(self.task_id, "u")["execution"]["remaining_duration_minutes"]))

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
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_end_at": (base + timedelta(minutes=20)).isoformat()})
        self.store.save_execution_feedback("u", {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-partial", "task_evaluation": {"completion": "partial"}, "state_evaluation": {}, "recommendation_evaluation": {}})
        task = self.store.get_task(self.task_id, "u")
        self.assertEqual((40, "queued"), (task["execution"]["remaining_duration_minutes"], task["status"]))

    def test_14_did_not_start_keeps_remaining_work(self):
        session = self.start()
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_minutes": 0})
        self.store.save_execution_feedback("u", {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-none", "task_evaluation": {"completion": "not_started", "actual_minutes": 30}, "state_evaluation": {}, "recommendation_evaluation": {}})
        task = self.store.get_task(self.task_id, "u")
        self.assertEqual((60, "queued", "not_started"), (task["execution"]["remaining_duration_minutes"], task["status"], self.store.list_execution_sessions("u")[0]["status"]))

    def test_15_selecting_another_task_keeps_compact_now_strip(self):
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("compact-running-strip", js)
        self.assertIn("data-return-now", js)

    def test_16_today_after_this_is_limited_to_two(self):
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn(".slice(0, 2)", js)

    def test_17_buffer_defaults_to_compact_summary(self):
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        self.assertIn("weeklyBufferSummary", html)
        self.assertIn("weeklyBufferDetails", html)

    def test_18_running_and_confirmed_blocks_do_not_float(self):
        css = (ROOT / "frontend" / "styles.css").read_text(encoding="utf-8")
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
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("if (byTask.length !== 2) return", js)
        self.assertIn("confirmedParallelOverlapAllowed", js)

    def test_21_start_pause_and_feedback_requests_are_idempotent(self):
        session = self.start("start-idem")
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        pause_payload = {"execution_session_id": session["execution_session_id"], "paused_at": (base + timedelta(minutes=10)).isoformat(), "request_id": "pause-idem"}
        self.store.pause_execution_session("u", pause_payload)
        self.store.pause_execution_session("u", pause_payload)
        feedback = {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-idem", "task_evaluation": {"completion": "partial"}, "state_evaluation": {}, "recommendation_evaluation": {}}
        first = self.store.save_execution_feedback("u", feedback)
        second = self.store.save_execution_feedback("u", feedback)
        with self.store.connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM execution_feedback WHERE user_id='u' AND request_id='feedback-idem'").fetchone()[0]
        self.assertEqual((first["id"], 1), (second["id"], count))

    def test_22_responsive_rules_keep_execution_controls_visible(self):
        css = (ROOT / "frontend" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("@media (max-width:1180px)", css)
        self.assertIn("min-height:40px", css)
        self.assertIn("overflow-y:auto", css)

    def test_23_pause_and_feedback_forms_do_not_ask_for_actual_minutes(self):
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('id="pauseActualMinutes"', html)
        self.assertNotIn('id="feedbackActualMinutes"', html)
        self.assertIn('id="pauseTrackedTime"', html)
        self.assertIn('value="no_progress"', html)

    def test_24_resume_continues_the_same_active_timer(self):
        session = self.start("start-resume")
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        paused = self.store.pause_execution_session("u", {"execution_session_id": session["execution_session_id"], "paused_at": (base + timedelta(minutes=20)).isoformat()})
        resumed = self.store.start_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_start_at": (base + timedelta(minutes=30)).isoformat(), "request_id": "resume-continuity"})
        ended = self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_end_at": (base + timedelta(minutes=40)).isoformat()})
        self.assertEqual((20, 30, paused["execution_session_id"]), (paused["accumulated_active_minutes"], ended["accumulated_active_minutes"], resumed["execution_session_id"]))

    def test_25_feedback_settles_a_session_only_once_even_with_new_request_id(self):
        session = self.start("start-once")
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_end_at": (base + timedelta(minutes=20)).isoformat()})
        common = {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "task_evaluation": {"completion": "partial"}, "state_evaluation": {}, "recommendation_evaluation": {}}
        first = self.store.save_execution_feedback("u", {**common, "request_id": "once-a"})
        second = self.store.save_execution_feedback("u", {**common, "request_id": "once-b"})
        task = self.store.get_task(self.task_id, "u")
        self.assertEqual((first["id"], 20, 40, True), (second["id"], task["execution"]["accumulated_actual_minutes"], task["execution"]["remaining_duration_minutes"], second["idempotent_replay"]))

    def test_26_worked_without_progress_preserves_remaining_work(self):
        session = self.start("start-no-progress")
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_end_at": (base + timedelta(minutes=20)).isoformat()})
        self.store.save_execution_feedback("u", {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "no-progress", "task_evaluation": {"completion": "no_progress", "remaining_duration_minutes": 0}, "state_evaluation": {}, "recommendation_evaluation": {}})
        task = self.store.get_task(self.task_id, "u")
        self.assertEqual((20, 60), (task["execution"]["accumulated_actual_minutes"], task["execution"]["remaining_duration_minutes"]))

    def test_27_conflicts_include_objects_times_minutes_reason_and_solutions(self):
        second = self.store.create_task("u", {"title": "Prepare slides", "due": self.store.get_task(self.task_id, "u")["due"], "duration": 60, "priority": "high"})
        patch = [
            {**self.block, "start": 9.0, "end": 10.0},
            {"block_id": "block-2", "task_id": second["id"], "day_index": self.block["day_index"], "start": 9.5, "end": 10.5, "session_minutes": 60, "planned_work_minutes": 60},
        ]
        result = self.store.validate_confirmed_schedule("u", {"plan_patch": patch, "unscheduled_tasks": [], "ai_task_analysis": {}})
        conflict = next(item for item in result["violations"] if item["type"] == "overlap")
        self.assertEqual(("Analyze interviews", "Prepare slides", "09:30", "10:00", 30), (conflict["task_title"], conflict["conflicting_task_title"], conflict["start_time"], conflict["end_time"], conflict["overlap_minutes"]))
        self.assertTrue(conflict["violation_id"] and conflict["message"] and conflict["solutions"])

    def test_28_pause_uses_simple_resume_choice_and_no_manual_minutes(self):
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("When would you like to continue?", html)
        self.assertIn("In 10 min", html)
        self.assertIn("Let HumanOS reschedule", html)
        self.assertNotIn("pauseAdjustedMinutes", html)
        self.assertNotIn("pauseCalendarAction", html)

    def test_31_pause_resume_timeline_and_feedback_do_not_double_count(self):
        session = self.start()
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET actual_start_at=?,resumed_at=?,timeline_json='[]' WHERE id=?", (base.isoformat(), base.isoformat(), session["execution_session_id"]))
        paused = self.store.pause_execution_session("u", {"execution_session_id": session["execution_session_id"], "paused_at": (base + timedelta(minutes=20)).isoformat(), "request_id": "pause-timeline"})
        resumed = self.store.start_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_start_at": (base + timedelta(minutes=35)).isoformat(), "request_id": "resume-timeline"})
        ended = self.store.end_execution_session("u", {"execution_session_id": session["execution_session_id"], "actual_end_at": (base + timedelta(minutes=50)).isoformat(), "request_id": "end-timeline"})
        self.assertEqual(session["execution_session_id"], resumed["execution_session_id"])
        self.assertEqual(35, ended["accumulated_active_minutes"])
        self.assertEqual(["pause", "resume", "end"], [event["type"] for event in ended["timeline"]])
        saved = self.store.save_execution_feedback("u", {"task_id": self.task_id, "execution_session_id": session["execution_session_id"], "request_id": "feedback-timeline", "task_evaluation": {"completion": "partial"}, "state_evaluation": {}, "recommendation_evaluation": {}})
        self.assertEqual(35, saved["task"]["execution"]["accumulated_actual_minutes"])

    def test_32_ready_session_beats_old_pending_feedback(self):
        current = self.current()["session"]
        with self.store.connect() as conn:
            conn.execute("UPDATE execution_sessions SET status='ended' WHERE id=?", (current["execution_session_id"],))
            conn.execute("INSERT INTO execution_sessions (id,user_id,task_id,block_id,week_id,plan_revision,planned_start_at,planned_end_at,planned_work_minutes,status,created_at,updated_at,timeline_json) VALUES ('exec-next','u',?,'block-next','2026-08-03',1,?,?,30,'ready',1,1,'[]')", (self.task_id, (datetime.now(ZoneInfo('Asia/Shanghai')) + timedelta(minutes=5)).isoformat(), (datetime.now(ZoneInfo('Asia/Shanghai')) + timedelta(minutes=35)).isoformat()))
        self.assertEqual("exec-next", self.current()["session"]["execution_session_id"])

    def test_33_early_finish_defaults_to_keep_free(self):
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="earlyFinishDialog"', html)
        self.assertIn("Keep it free", html)
        self.assertIn("Update today’s plan", html)
        self.assertIn("Free time kept open.", js)

    def test_34_feedback_returns_to_execution_rail_not_task_detail(self):
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        feedback_tail = js[js.index('feedbackForm.addEventListener("submit"'):]
        self.assertIn('activeSelectionMode = "auto";', feedback_tail)
        self.assertIn('rightRailMode = "plan";', feedback_tail)

    def test_35_local_plan_revision_preserves_paused_execution_session_identity(self):
        session = self.start("start-local-revision")
        base = datetime(2026, 8, 7, 9, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute(
                "UPDATE execution_sessions SET actual_start_at=?,resumed_at=? WHERE id=?",
                (base.isoformat(), base.isoformat(), session["execution_session_id"]),
            )
        paused = self.store.pause_execution_session("u", {
            "execution_session_id": session["execution_session_id"],
            "paused_at": (base + timedelta(minutes=10)).isoformat(),
            "request_id": "pause-local-revision",
        })
        moved = {**self.block, "start": 10.0, "end": 11.0}
        confirmed = self.store.confirm_plan("u", {
            "week_id": "2026-08-03", "request_id": "local-revision",
            "plan_patch": [moved], "unscheduled_tasks": [],
            "ai_task_analysis": {}, "decision": {"local_adjustment": {"scope": "today_after_pause"}},
        })
        current = self.store.current_execution("u")
        self.assertEqual(paused["execution_session_id"], current["session"]["execution_session_id"])
        self.assertEqual("paused", current["session"]["status"])
        self.assertEqual(10, current["session"]["accumulated_active_minutes"])
        self.assertEqual(50, current["session"]["session_remaining_minutes"])
        self.assertEqual(confirmed["plan"]["plan_revision"], current["session"]["plan_revision"])

    def test_36_pause_local_preview_and_routine_without_fixed_shift_are_present(self):
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn('scope: "today_after_pause"', js)
        self.assertIn('? "Update today"', js)
        self.assertIn('explicitShiftMinutes === null', js)
        self.assertNotIn('Number(item.shift_minutes || 30)', js)

    def test_29_expired_unstarted_session_has_zero_active_ended_state(self):
        session = self.current()["session"]
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        with self.store.connect() as conn:
            conn.execute(
                "UPDATE execution_sessions SET planned_start_at=?,planned_end_at=?,status='ready',accumulated_active_minutes=0 WHERE id=?",
                ((now - timedelta(minutes=60)).isoformat(), (now - timedelta(minutes=15)).isoformat(), session["execution_session_id"]),
            )
        result = self.current()
        self.assertEqual(("session_ended", "ready", 0), (result["mode"], result["session"]["status"], result["session"]["live_active_minutes"]))

    def test_30_ended_session_options_follow_tracked_time(self):
        html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("min tracked automatically", js)
        self.assertIn("Finished the whole task", js)
        self.assertIn("Worked, no progress", js)
        self.assertIn("Continue for ${continuationMinutes} min", js)
        self.assertNotIn("Pause and save context</button>", js)
        self.assertIn('id="feedbackProgress"', html)
        self.assertIn('id="feedbackNextStep"', html)


if __name__ == "__main__":
    unittest.main()
