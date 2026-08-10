import json
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from backend.humanos_graph import day_index_from_due, scheduler_node
from backend.humanos_server import Store, confirmed_parallel_overlap_allowed, parallel_pair_rule


class PromptAndTemporalContractTests(unittest.TestCase):
    def test_prompt_benchmark_has_required_coverage(self) -> None:
        cases = json.loads((Path(__file__).parent / "prompt_benchmark_cases.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(cases), 40)
        categories = {case["category"] for case in cases}
        self.assertTrue({"task_split", "multilingual", "temporal_semantics", "missing_fields", "prompt_injection", "dialog_context", "explicit_state"}.issubset(categories))
        self.assertEqual(len(cases), len({case["id"] for case in cases}))

    def test_frontend_does_not_fall_back_to_a_local_scheduler(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("allocateWeeklyPlan", frontend)
        self.assertIn('setEngineStatus("AI unavailable"', frontend)
        self.assertIn('setBackendStatus("AI connection unavailable. Try again."', frontend)
        self.assertIn('api("/api/schedules/decide"', frontend)

    def test_review_ui_hides_internal_debug_output_and_uses_single_plan_confirmation(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        html = (Path(__file__).parents[1] / "frontend" / "index.html").read_text(encoding="utf-8")
        self.assertIn("mandatoryDecisions", frontend)
        self.assertIn("safe_default_on_plan_confirmation", frontend)
        self.assertIn('confirmScheduleBtn.textContent = pendingSchedulePlan.local_adjustment', frontend)
        self.assertIn(': "Confirm plan"', frontend)
        self.assertNotIn("Needs attention", frontend + html)
        self.assertNotIn("Not treated as hard constraints", frontend)
        self.assertNotIn("<summary>Technical details</summary>", frontend)
        self.assertIn("Why did HumanOS choose these times?", html)
        self.assertNotIn("Works for me", frontend + html)
        self.assertNotIn("Review 2 more tasks", frontend + html)
        self.assertNotIn("0 of 2 reviewed", frontend + html)
        self.assertNotIn("View all ${reviewTaskIds.length} task times", frontend)
        self.assertNotIn("View confirmed task times", frontend)
        self.assertNotIn("View alternative plans", frontend)

    def test_planner_generates_internal_candidates_but_exposes_one_ai_selected_plan(self) -> None:
        backend = (Path(__file__).parents[1] / "backend" / "humanos_server.py").read_text(encoding="utf-8")
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("Generate exactly three meaningfully different internal candidates", backend)
        self.assertIn("Apply this lexicographic priority order", backend)
        self.assertIn("Return exactly one selected_candidate_id", backend)
        self.assertIn('"Your plan is ready"', frontend)
        self.assertNotIn("Draft needs changes", frontend)
        self.assertNotIn("Recommended plan", frontend)
        self.assertNotIn("candidate-tab", frontend)

    def test_plan_failures_are_presented_as_concrete_user_decisions(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("HumanOS needs ${decisionCount === 1", frontend)
        self.assertIn("Split into shorter sessions", frontend)
        self.assertNotIn("Python constraint validation failed", frontend)
        self.assertNotIn("Plan failed constraint validation", frontend)

    def test_rejected_calendar_drag_is_local_and_reversible(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        css = (Path(__file__).parents[1] / "frontend" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("calendarBlockConflictDetails", frontend)
        self.assertIn("Couldn’t move — overlaps ${conflict.conflicting_label", frontend)
        self.assertIn('eventType: "failed_edit_attempt"', frontend)
        self.assertNotIn('data-conflict-action="undo"', frontend)
        self.assertNotIn("Move after ${conflict.conflicting_label", frontend)
        self.assertNotIn("calendar-conflict-prompt", css)

    def test_flexible_activity_editor_accepts_non_quarter_hour_duration(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        html = (Path(__file__).parents[1] / "frontend" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="contextEventDuration" type="number" min="15" step="1"', html)
        self.assertIn("Math.max(15, Math.round(Number(durationRaw)))", frontend)

    def test_resolved_parallel_suggestion_collapses_to_one_row(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        css = (Path(__file__).parents[1] / "frontend" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("parallel-resolution-row", frontend)
        self.assertIn("data-change-parallel", frontend)
        self.assertIn("✓ Parallel:", frontend)
        self.assertIn(".parallel-resolution-row", css)

    def test_agent_drawer_filters_operational_logs(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("conversationalTitles", frontend)
        self.assertIn("visibleMessages", frontend)
        self.assertNotIn('title: "Plan note"', frontend)

    def test_calendar_colors_are_identity_based_and_parallel_sessions_use_two_columns(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        html = (Path(__file__).parents[1] / "frontend" / "index.html").read_text(encoding="utf-8")
        self.assertIn("function layoutParallelTimelineBlocks", frontend)
        self.assertIn("parallel_column_count === 2", frontend)
        self.assertNotIn('if (task.priority === "高") return "blue"', frontend)
        self.assertIn("Dashed borders are Draft. Solid borders are Confirmed.", html)
        self.assertIn(">Work</span>", html)
        self.assertIn(">Protected time</span>", html)

    def test_draft_and_decision_are_distinct_visual_states(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        styles = (Path(__file__).parents[1] / "frontend" / "styles.css").read_text(encoding="utf-8")
        self.assertIn('block.source === "pending" ? "Draft"', frontend)
        self.assertIn('block.constraint_conflict ? "Needs your decision"', frontend)
        self.assertIn("pending-static", frontend)
        self.assertIn(".timeline-event.task-event.pending-static", styles)
        self.assertIn("animation: draft-session-float 2.2s ease-in-out 3", styles)

    def test_only_mandatory_decisions_block_the_final_action(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("confirmScheduleBtn.disabled = !hasDraftTasks || mandatoryDecisions.length > 0", frontend)
        self.assertIn('"safe_default_on_plan_confirmation"', frontend)
        self.assertIn('suggestion.change_from_status === "accepted" ? "accepted" : "rejected"', frontend)
        self.assertIn("minutes of “${task?.title", frontend)
        self.assertIn("Add available time", frontend)
        self.assertIn("Move deadline", frontend)
        self.assertIn("Reduce scope", frontend)

    def test_right_rail_modes_are_mutually_exclusive(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        html = (Path(__file__).parents[1] / "frontend" / "index.html").read_text(encoding="utf-8")
        self.assertIn('const showingTask = rightRailMode === "task"', frontend)
        self.assertIn('rightRailMode = "pause"', frontend)
        self.assertIn('document.querySelector(".left-rail")?.appendChild(chatDrawer)', frontend)
        self.assertIn('rightPlanningRail.appendChild(planReviewPanel)', frontend)
        self.assertEqual(1, html.count('id="confirmScheduleBtn"'))
        self.assertEqual(1, html.count('id="selectedTaskDetails"'))
        self.assertEqual(1, html.count('id="chatDrawer"'))

    def test_initial_state_counts_as_daily_checkin(self) -> None:
        frontend = (Path(__file__).parents[1] / "frontend" / "app.js").read_text(encoding="utf-8")
        self.assertIn("saveRuntimeStateToBackend({ daily_checkin: true })", frontend)
        self.assertIn("currentProfile.last_daily_checkin_date", frontend)
        self.assertIn("markDailyCheckInSeen();", frontend)

    def test_default_legend_is_small_and_context_types_are_on_demand(self) -> None:
        html = (Path(__file__).parents[1] / "frontend" / "index.html").read_text(encoding="utf-8")
        legend = html.split('<div class="calendar-legend"', 1)[1].split("</div>", 1)[0]
        self.assertIn("Work", legend)
        self.assertIn("Protected time", legend)
        self.assertIn("Buffer", legend)
        self.assertIn('class="hidden" id="conflictLegend"', legend)
        self.assertIn('class="hidden" id="parallelLegend"', legend)
        self.assertNotIn("Routine window", legend)
        self.assertNotIn("Flexible activity", legend)

    def test_plan_review_has_one_scroll_container_and_no_card_scroll(self) -> None:
        styles = (Path(__file__).parents[1] / "frontend" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".plan-review-panel {", styles)
        self.assertIn("overflow-y: auto", styles)
        self.assertIn(".plan-review-panel .pending-plan-content { min-height: 0; overflow: visible", styles)
        self.assertIn(".review-decision-details .decision-trace { max-height: none", styles)

    def test_global_planner_prompt_generates_times_before_python_validation(self) -> None:
        backend = (Path(__file__).parent / "humanos_server.py").read_text(encoding="utf-8")
        self.assertIn("你是 HumanOS 的整周全局排程 agent", backend)
        self.assertIn("必须真正生成具体时间块", backend)
        self.assertIn("weekly-global-planner-v2", backend)
        self.assertIn("validate_llm_schedule_candidates", backend)

    def test_parallel_compatibility_uses_a_separate_prompt_and_python_gate(self) -> None:
        tasks = [
            {"id": "laundry", "title": "洗衣", "context": "", "due": "周五 18:00", "duration": 60, "parallelizable": True},
            {"id": "podcast", "title": "英语播客", "context": "", "due": "周五 18:00", "duration": 30, "parallelizable": True},
        ]
        first_result = {
            "task_demands": [
                {"task_id": "laundry", "level": "low", "confidence_level": "high"},
                {"task_id": "podcast", "level": "medium", "confidence_level": "high"},
            ],
            "dependencies": [],
            "task_resource_profiles": [
                {"task_id": "laundry", "resource_modality": ["manual"], "parallelizable": True, "evidence": ["手部活动"], "confidence_level": "high"},
                {"task_id": "podcast", "resource_modality": ["auditory"], "parallelizable": True, "evidence": ["纯听觉"], "confidence_level": "high"},
            ],
        }
        pair_result = {"candidate_pairs": [{
            "primary_task_id": "laundry", "secondary_task_id": "podcast", "compatible": True,
            "suggested_overlap_minutes": 30, "resource_basis": ["manual", "auditory"],
            "confidence_level": "high", "evidence": ["资源互补"], "requires_user_confirmation": True,
        }]}
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir, patch("backend.humanos_server.chat_completion", side_effect=[first_result, pair_result]) as mocked:
            analysis = Store(Path(temp_dir) / "parallel.db").analyze_schedule_inputs({"tasks": tasks, "profile": {}})
        self.assertEqual(2, mocked.call_count)
        self.assertEqual("parallel-compatibility-v2", analysis["parallel_prompt_version"])
        self.assertEqual(1, len(analysis["parallel_candidate_pairs"]))
        self.assertTrue(analysis["parallel_candidate_pairs"][0]["python_rule_passed"])

    def test_flexible_activity_parallel_pair_is_semantic_model_output(self) -> None:
        profile = {"weekly_context": {"context_items": [
            {"id": "laundry", "type": "flexible_activity", "title": "Do the laundry", "duration_minutes": 40, "days": [3, 4]},
            {"id": "english", "type": "flexible_activity", "title": "Listen to English audio", "duration_minutes": 30, "days": [3, 4]},
        ]}}
        first_result = {"task_demands": [], "dependencies": [], "task_resource_profiles": []}
        pair_result = {"candidate_pairs": [{
            "primary_task_id": "context:laundry", "secondary_task_id": "context:english",
            "compatible": True, "suggested_overlap_minutes": 30,
            "resource_basis": ["manual", "auditory"], "confidence_level": "high",
            "evidence": ["The activities use complementary resources."], "requires_user_confirmation": True,
        }]}
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir, patch("backend.humanos_server.chat_completion", side_effect=[first_result, pair_result]):
            analysis = Store(Path(temp_dir) / "context-parallel.db").analyze_schedule_inputs({"tasks": [], "profile": profile})
        self.assertEqual(1, len(analysis["parallel_context_pairs"]))
        self.assertEqual("laundry", analysis["parallel_context_pairs"][0]["primary_context_id"])

    def test_python_rejects_two_language_tasks_even_if_model_marks_them_parallel(self) -> None:
        demands = {"read": {"level": "low"}, "course": {"level": "medium"}}
        allowed, reason = parallel_pair_rule(
            {"task_id": "read", "resource_modality": ["visual", "verbal"], "parallelizable": True},
            {"task_id": "course", "resource_modality": ["auditory", "verbal"], "parallelizable": True},
            demands,
        )
        self.assertFalse(allowed)
        self.assertIn("only permits", reason)

    def test_only_confirmed_same_parallel_group_may_overlap(self) -> None:
        first = {"task_id": "laundry", "start": 18.0, "end": 19.0, "parallel_group_id": "g1", "parallel_user_confirmed": True, "parallel_task_ids": ["laundry", "podcast"], "allowed_overlap_minutes": 30}
        second = {"task_id": "podcast", "start": 18.0, "end": 18.5, "parallel_group_id": "g1", "parallel_user_confirmed": True, "parallel_task_ids": ["laundry", "podcast"], "allowed_overlap_minutes": 30}
        self.assertTrue(confirmed_parallel_overlap_allowed(first, second))
        self.assertFalse(confirmed_parallel_overlap_allowed(first, {**second, "parallel_user_confirmed": False}))
        self.assertFalse(confirmed_parallel_overlap_allowed(first, {**second, "parallel_group_id": "g2"}))

    def test_parallel_suggestion_is_created_after_a_non_overlapping_base_plan(self) -> None:
        state = {
            "profile": {"timezone": "Asia/Shanghai", "_client_now": "2026-08-03T08:00:00+08:00"},
            "tasks": [
                {"id": "laundry", "title": "洗衣", "due": "周五 18:00"},
                {"id": "podcast", "title": "英语播客", "due": "周五 18:00"},
            ],
            "ai_task_analysis": {"parallel_candidate_pairs": [{
                "primary_task_id": "laundry", "secondary_task_id": "podcast", "suggested_overlap_minutes": 30,
                "resource_basis": ["manual", "auditory"], "confidence_level": "high",
                "evidence": ["资源互补"], "python_rule_reason": "规则通过",
            }]},
        }
        plan = [
            {"block_id": "laundry-1", "task_id": "laundry", "kind": "task_session", "day_index": 2, "start": 18.0, "end": 19.0, "session_minutes": 60},
            {"block_id": "podcast-1", "task_id": "podcast", "kind": "task_session", "day_index": 3, "start": 9.0, "end": 9.5, "session_minutes": 30},
        ]
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            suggestions = Store(Path(temp_dir) / "parallel-suggestion.db").build_parallel_suggestions(state, plan)
        self.assertEqual(1, len(suggestions))
        self.assertEqual("pending", suggestions[0]["status"])
        self.assertEqual(2, suggestions[0]["day_index"])
        self.assertTrue(suggestions[0]["requires_user_confirmation"])

    def test_backend_revalidates_confirmed_parallel_sessions(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "parallel-validation.db")
            store.upsert_profile({
                "user_id": "u", "timezone": "Asia/Shanghai", "role": "student",
                "weekly_context": {"weekly_available_windows": "周一至周五 08:00-21:00", "keep_buffer": False},
            })
            for task in (
                {"id": "laundry", "title": "洗衣", "due": "周五 18:00", "duration": 60, "priority": "低", "parallelizable": True, "resource_modality": ["manual"]},
                {"id": "podcast", "title": "英语播客", "due": "周五 18:00", "duration": 30, "priority": "低", "parallelizable": True, "resource_modality": ["auditory"]},
            ):
                store.create_task("u", task)
            shared = {"day_index": 2, "start": 18.0, "parallel_group_id": "g", "parallel_user_confirmed": True, "parallel_task_ids": ["laundry", "podcast"], "allowed_overlap_minutes": 30}
            payload = {
                "plan_patch": [
                    {**shared, "block_id": "a", "task_id": "laundry", "end": 19.0},
                    {**shared, "block_id": "b", "task_id": "podcast", "end": 18.5},
                ],
                "ai_task_analysis": {
                    "task_demands": [{"task_id": "laundry", "level": "low"}, {"task_id": "podcast", "level": "medium"}],
                    "task_resource_profiles": [
                        {"task_id": "laundry", "resource_modality": ["manual"], "parallelizable": True},
                        {"task_id": "podcast", "resource_modality": ["auditory"], "parallelizable": True},
                    ],
                },
            }
            accepted = store.validate_confirmed_schedule("u", payload)
            rejected = store.validate_confirmed_schedule("u", {**payload, "plan_patch": [{**block, "parallel_user_confirmed": False} for block in payload["plan_patch"]]})
        self.assertTrue(accepted["valid"], accepted["violations"])
        self.assertFalse(rejected["valid"])
        self.assertTrue(any(item["type"] == "overlap" for item in rejected["violations"]))

    def test_python_accepts_valid_ai_time_blocks_without_moving_them(self) -> None:
        profile = {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T08:00:00+08:00",
            "deep_work_window": "09:00-11:30",
            "low_energy_window": "14:00-15:30",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "weekly_context": {"weekly_available_windows": "周一至周五 08:00-18:00", "keep_buffer": False},
        }
        task = {
            "id": "paper", "title": "论文", "task_type": "flexible_task", "due": "周五 18:00",
            "duration": 60, "priority": "高", "status": "queued",
        }
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "planner.db")
            candidates = store.validate_llm_schedule_candidates(
                {"profile": profile, "tasks": [task], "ai_task_analysis": {"task_demands": [{"task_id": "paper", "level": "high"}]}},
                {"plan_patch": []},
                {"candidate_plans": [{"id": "ai", "label": "AI", "blocks": [{"task_id": "paper", "day_index": 0, "start": 9.0, "end": 10.0, "reason": "高负荷窗口"}]}]},
            )
        self.assertTrue(candidates[0]["validation"]["valid"])
        block = candidates[0]["plan_patch"][0]
        self.assertEqual(9.0, block["start"])
        self.assertEqual(10.0, block["end"])
        self.assertEqual("ai_global_weekly_plan", block["state_scope"])

    def test_momentary_state_changes_the_valid_next_session(self) -> None:
        profile = {
            "timezone": "Asia/Shanghai", "_client_now": "2026-08-03T08:00:00+08:00",
            "deep_work_window": "09:00-11:30", "low_energy_window": "14:00-15:30",
            "weekly_context": {"weekly_available_windows": "周一至周五 08:00-18:00", "keep_buffer": False},
        }
        tasks = [
            {"id": "analysis", "title": "Analyze interview transcripts", "task_type": "flexible_task", "due": "周五 18:00", "duration": 45, "priority": "High", "status": "queued"},
            {"id": "admin", "title": "Organize files", "task_type": "flexible_task", "due": "周五 18:00", "duration": 30, "priority": "Medium", "status": "queued"},
        ]
        analysis = {"task_demands": [{"task_id": "analysis", "level": "high"}, {"task_id": "admin", "level": "low"}]}
        high_focus_wrong = {"candidate_plans": [{"id": "wrong", "blocks": [
            {"task_id": "admin", "day_index": 0, "start": 8.0, "end": 8.5},
            {"task_id": "analysis", "day_index": 0, "start": 9.0, "end": 9.75},
        ]}]}
        high_focus_right = {"candidate_plans": [{"id": "right", "blocks": [
            {"task_id": "analysis", "day_index": 0, "start": 8.0, "end": 8.75},
            {"task_id": "admin", "day_index": 0, "start": 9.0, "end": 9.5},
        ]}]}
        low_focus_wrong = {"candidate_plans": [{"id": "low-wrong", "blocks": [
            {"task_id": "analysis", "day_index": 0, "start": 8.0, "end": 8.75},
            {"task_id": "admin", "day_index": 0, "start": 9.0, "end": 9.5},
        ]}]}
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "state-causality.db")
            high_state = {"profile": profile, "tasks": tasks, "runtime_state": {"focus": 7, "energy": 6, "stress": 3}, "ai_task_analysis": analysis}
            low_state = {"profile": profile, "tasks": tasks, "runtime_state": {"focus": 2, "energy": 2, "stress": 6}, "ai_task_analysis": analysis}
            rejected_high = store.validate_llm_schedule_candidates(high_state, {"plan_patch": []}, high_focus_wrong)[0]
            accepted_high = store.validate_llm_schedule_candidates(high_state, {"plan_patch": []}, high_focus_right)[0]
            rejected_low = store.validate_llm_schedule_candidates(low_state, {"plan_patch": []}, low_focus_wrong)[0]
        self.assertFalse(rejected_high["validation"]["valid"])
        self.assertTrue(any(item["type"] == "momentary_state_not_applied" for item in rejected_high["validation"]["violations"]))
        self.assertTrue(accepted_high["validation"]["valid"], accepted_high["validation"]["violations"])
        self.assertEqual("selected_high_demand_ready_task", accepted_high["state_decision"]["result"])
        self.assertFalse(rejected_low["validation"]["valid"])

    def test_calendar_capacity_does_not_inflate_exact_task_work(self) -> None:
        profile = {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T08:00:00+08:00",
            "task_preferences": {"rest_between_tasks_minutes": 0},
            "weekly_context": {"weekly_available_windows": "周一 08:00-18:00", "keep_buffer": False},
        }
        task = {
            "id": "experiment", "title": "Experiment design", "task_type": "flexible_task",
            "due": "周一 18:00", "duration": 200, "priority": "高", "status": "queued",
        }
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            candidates = Store(Path(temp_dir) / "exact-duration.db").validate_llm_schedule_candidates(
                {"profile": profile, "tasks": [task], "ai_task_analysis": {"task_demands": []}},
                {"plan_patch": []},
                {"candidate_plans": [{"id": "ai", "label": "AI", "blocks": [
                    {"task_id": "experiment", "day_index": 0, "start": 8.0, "end": 11.5},
                ]}]},
            )
        self.assertTrue(candidates[0]["validation"]["valid"])
        block = candidates[0]["plan_patch"][0]
        self.assertEqual(210, block["session_minutes"])
        self.assertEqual(200, block["planned_work_minutes"])
        self.assertEqual(10, block["padding_minutes"])
        self.assertEqual([], candidates[0]["unscheduled_tasks"])

    def test_ai_task_can_trigger_a_bounded_routine_adjustment(self) -> None:
        profile = {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T08:00:00+08:00",
            "task_preferences": {"rest_between_tasks_minutes": 15},
            "weekly_context": {
                "weekly_available_windows": "周一 08:00-18:00",
                "keep_buffer": False,
                "context_items": [{
                    "id": "ctx-lunch", "type": "recurring_routine", "title": "午饭",
                    "day": "周一", "days": [0], "start": 12.0, "end": 13.0,
                    "duration_minutes": 60, "shift_minutes": 30, "confirmed": True,
                }],
            },
        }
        task = {
            "id": "urgent", "title": "紧急提交", "task_type": "flexible_task", "due": "周一 13:00",
            "duration": 30, "priority": "高", "status": "queued",
        }
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "routine-adjustment.db")
            candidates = store.validate_llm_schedule_candidates(
                {"profile": profile, "tasks": [task], "ai_task_analysis": {"task_demands": []}},
                {"plan_patch": []},
                {"candidate_plans": [{"id": "ai", "blocks": [{"task_id": "urgent", "day_index": 0, "start": 12.0, "end": 12.5}]}]},
            )
        self.assertTrue(candidates[0]["validation"]["valid"])
        self.assertEqual(1, len(candidates[0]["routine_adjustments"]))
        adjustment = candidates[0]["routine_adjustments"][0]
        self.assertLessEqual(abs(adjustment["start"] - 12.0), 0.5)
        self.assertFalse(adjustment["start"] < 12.5 and 12.0 < adjustment["end"])

    def test_absolute_date_is_resolved_only_inside_current_week(self) -> None:
        reference = datetime(2026, 8, 3, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.assertEqual(4, day_index_from_due("2026-08-07 17:00", reference))
        self.assertIsNone(day_index_from_due("2026-08-10 17:00", reference))
        self.assertIsNone(day_index_from_due("下周一", reference))

    def test_user_confirmed_difficulty_overrides_ai_hypothesis(self) -> None:
        profile = {
            "timezone": "Asia/Shanghai",
            "_client_now": "2026-08-03T10:00:00+08:00",
            "deep_work_window": "09:00-11:30",
            "low_energy_window": "14:00-15:30",
            "task_preferences": {"preferred_session_minutes": 45, "rest_between_tasks_minutes": 15},
            "weekly_context": {"weekly_available_windows": "周一至周五 08:00-18:00", "keep_buffer": False},
        }
        task = {
            "id": "hard-task", "title": "整理资料", "task_type": "flexible_task", "due": "周五 18:00",
            "duration": 60, "priority": "中", "status": "queued", "expected_difficulty": 7,
            "task_demand": {"expected_difficulty": 7, "estimated_cognitive_load": "high", "user_confirmed": True, "source": "user_self_report"},
        }
        result = scheduler_node(None)({
            "tasks": [task], "profile": profile, "runtime_state": {"focus": 5, "energy": 5, "stress": 3},
            "ai_task_analysis": {"task_demands": [{"task_id": "hard-task", "level": "low", "confidence_level": "high", "evidence": ["LLM guess"]}]},
        })
        self.assertTrue(result["plan_patch"])
        evidence = result["plan_patch"][0]["constraint_evidence"]
        self.assertTrue(any("user expected_difficulty=7/7" in item for item in evidence))


if __name__ == "__main__":
    unittest.main()
