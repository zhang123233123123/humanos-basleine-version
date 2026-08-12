import unittest

from backend.app.application.classify_chat_intent import classify_chat_intent
from backend.app.application.chat_routing import should_parse_task_candidates
from backend.app.domain.intent.models import AIIntentResult


class AIFirstIntentTests(unittest.TestCase):
    def test_ai_semantics_override_keyword_fallback(self):
        def classify(*args, **kwargs):
            return AIIntentResult(primary_intent="query_calendar", confidence=0.96, read_only=True, reason="用户只是在查询")
        decision = classify_chat_intent("帮我看看今天要完成什么", current_time="2026-08-12T09:00:00+08:00", timezone_name="Asia/Shanghai", chat_context={}, ai_classifier=classify)
        self.assertEqual(decision.intent, "other")
        self.assertEqual(decision.source, "ai")
        self.assertFalse(should_parse_task_candidates("帮我看看今天要完成什么", decision))

    def test_ai_failure_uses_deterministic_fallback(self):
        decision = classify_chat_intent("周五前完成期末复习，大概三小时", current_time="2026-08-12T09:00:00+08:00", timezone_name="Asia/Shanghai", chat_context={}, ai_classifier=lambda *args, **kwargs: None)
        self.assertEqual(decision.intent, "add_task")
        self.assertEqual(decision.source, "deterministic_fallback")

    def test_delete_requires_confirmation(self):
        def classify(*args, **kwargs):
            return AIIntentResult(primary_intent="delete_task", confidence=0.95, target_task_references=["数学作业"], reason="删除请求")
        decision = classify_chat_intent("删除数学作业", current_time="2026-08-12T09:00:00+08:00", timezone_name="Asia/Shanghai", chat_context={}, ai_classifier=classify)
        self.assertTrue(decision.requires_clarification)


if __name__ == "__main__":
    unittest.main()
