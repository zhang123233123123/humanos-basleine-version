import unittest

from backend.app.application.task_payloads import build_task_previews, normalize_parser_items


class TaskPayloadTests(unittest.TestCase):
    def test_flexible_task_preserves_deadline_and_duration(self) -> None:
        payloads = normalize_parser_items(
            [{"title": "期末复习", "schedule_type": "flexible_task", "deadline_at": "2026-08-14T23:59:00+08:00", "duration_minutes": 180, "priority": "高"}],
            source_text="周五前完成期末复习，大概三个小时",
            timezone_name="Asia/Shanghai",
            parser_name="pydantic_ai",
            inferred_single_duration=None,
            normalize_duration=lambda value: int(value),
        )
        self.assertEqual(180, payloads[0]["duration"])
        self.assertEqual(payloads[0]["deadline_at"], payloads[0]["due"])
        self.assertIsNone(payloads[0]["start_at"])

    def test_preview_reports_missing_fields_without_persistence(self) -> None:
        previews = build_task_previews(
            [{"title": "整理资料", "task_type": "flexible_task", "due": "未设置", "duration": None}],
            parser_name="local_fallback",
            preview_id=lambda index: f"preview-test-{index}",
        )
        self.assertEqual("preview-test-0", previews[0]["id"])
        self.assertTrue(previews[0]["is_preview"])
        self.assertIn("deadline_at", previews[0]["missing_fields"])
        self.assertIn("duration_minutes", previews[0]["missing_fields"])


if __name__ == "__main__":
    unittest.main()
