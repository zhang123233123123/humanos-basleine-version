"""Regression tests for shared task-input and timeline contracts."""

from __future__ import annotations

import unittest

try:
    from app.application.task_input import normalize_parsed_task_items
    from app.domain.timeline import validate_block_overlaps
except ModuleNotFoundError:
    from backend.app.application.task_input import normalize_parsed_task_items
    from backend.app.domain.timeline import validate_block_overlaps


class TaskInputContractTests(unittest.TestCase):
    def test_deadline_remains_deadline_for_flexible_work(self):
        result = normalize_parsed_task_items([
            {
                "title": "Write the findings section",
                "schedule_type": "flexible_task",
                "deadline_at": "2026-08-14T17:00:00+08:00",
                "duration_minutes": 120,
                "priority": "High",
                "confidence": 0.9,
            }
        ], "Write the findings section by Friday 17:00")
        self.assertEqual(result[0]["deadline_at"], "2026-08-14T17:00:00+08:00")
        self.assertIsNone(result[0]["start_at"])
        self.assertEqual(result[0]["priority"], "高")
        self.assertEqual(result[0]["input_contract"]["version"], "typed-task-input-v1")

    def test_fixed_event_requires_start_not_deadline(self):
        result = normalize_parsed_task_items([
            {"title": "Research meeting", "schedule_type": "fixed_event", "duration_minutes": 60}
        ], "Research meeting")
        self.assertIn("start_at", result[0]["missing_fields"])
        self.assertNotIn("deadline_at", result[0]["missing_fields"])

    def test_bilingual_classification_is_inspectable(self):
        result = normalize_parsed_task_items([
            {"title": "整理参考文献", "deadline_at": "2026-08-14T18:00:00+08:00", "duration_minutes": 45}
        ], "整理参考文献")
        self.assertEqual(result[0]["input_contract"]["domain_type"], "admin")
        self.assertEqual(result[0]["input_contract"]["classification_rule"], "formatting_admin")


class TimelineContractTests(unittest.TestCase):
    def test_overlap_is_reported_on_week_axis(self):
        violations = validate_block_overlaps([
            {"block_id": "a", "task_id": "task-a", "day_index": 2, "start": 9.0, "end": 10.0},
            {"block_id": "b", "task_id": "task-b", "day_index": 2, "start": 9.5, "end": 10.5},
        ])
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0]["type"], "overlap")
        self.assertEqual(violations[0]["start"], 9.5)
        self.assertEqual(violations[0]["end"], 10.0)

    def test_confirmed_parallel_pair_can_overlap(self):
        blocks = [
            {"block_id": "a", "task_id": "laundry", "day_index": 3, "start": 18.0, "end": 19.0, "parallel_group_id": "p1"},
            {"block_id": "b", "task_id": "podcast", "day_index": 3, "start": 18.0, "end": 18.5, "parallel_group_id": "p1"},
        ]
        violations = validate_block_overlaps(
            blocks,
            overlap_allowed=lambda first, second: first.get("parallel_group_id") == second.get("parallel_group_id"),
        )
        self.assertEqual(violations, [])

    def test_invalid_block_returns_normalization_violation(self):
        violations = validate_block_overlaps([
            {"block_id": "bad", "task_id": "task-a", "day_index": 7, "start": 9.0, "end": 10.0}
        ])
        self.assertEqual(violations[0]["type"], "timeline_normalization")


if __name__ == "__main__":
    unittest.main()

