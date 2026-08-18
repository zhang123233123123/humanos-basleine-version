import tempfile
import unittest
from pathlib import Path

from backend.app.application.context_dump_evidence import project_context_dump
from backend.humanos_server import Store


class ContextDumpEvidenceAdapterTests(unittest.TestCase):
    def test_projection_preserves_user_fields_and_task_scope(self) -> None:
        _, evidence = project_context_dump(
            event_id="behavior-1", evidence_id="evidence-1",
            context_dump={
                "id": "dump-1", "user_id": "u", "created_at": 1_700_000_000_000,
                "timezone": "Asia/Shanghai", "local_time": "2026-08-18T21:15:00+08:00",
                "checkpoint_type": "execution_interruption",
                "submitted_fields": {"progress": "coded two interviews", "next_action": "code interview three"},
            },
            task={
                "id": "task-1", "task_type": "flexible_task", "type": "analysis",
                "resource_modality": ["visual", "verbal"], "attention_mode": "continuous",
            },
        )
        value = evidence.model_dump(mode="json")["structured_value"]
        temporal = evidence.model_dump(mode="json")["scope"]["temporal_context"]
        self.assertEqual("task-1", evidence.scope.task_id)
        self.assertEqual("flexible_task", evidence.scope.task_schedule_type)
        self.assertEqual({"progress": "coded two interviews", "next_action": "code interview three"}, value["values"])
        self.assertIn("stop_reason", value["missing_fields"])
        self.assertEqual("execution_interruption", temporal["checkpoint_type"])
        self.assertEqual(21, temporal["local_hour"])

    def test_empty_checkpoint_is_not_pattern_eligible(self) -> None:
        _, evidence = project_context_dump(
            event_id="behavior-1", evidence_id="evidence-1",
            context_dump={
                "id": "dump-1", "user_id": "u", "created_at": 1,
                "timezone": "UTC", "local_time": "2026-08-18T10:00:00+00:00",
                "submitted_fields": {},
            },
            task=None,
        )
        self.assertFalse(evidence.user_explicit)
        self.assertFalse(evidence.eligible_for_pattern)


class ContextDumpEvidenceIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "humanos.db")
        self.store.upsert_profile({"user_id": "u", "timezone": "Asia/Shanghai"})
        self.task = self.store.create_task("u", {
            "title": "Analyze interviews", "duration": 90, "task_type": "flexible_task",
            "resource_modality": ["visual", "verbal"], "attention_mode": "continuous",
        })

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_context_dump_projects_once_without_learning_profile(self) -> None:
        before = self.store.get_profile("u")["learned_patterns"]
        payload = {
            "task_id": self.task["id"], "request_id": "dump-request-1",
            "progress": "two interviews coded", "next_action": "code the third",
            "stop_reason": "interrupted", "task_remaining_minutes": 45,
        }
        first = self.store.save_context_dump("u", payload)
        second = self.store.save_context_dump("u", payload)
        evidence = [item for item in self.store.list_personalization_evidence("u") if item["source_type"] == "context_dump"]
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(1, len(evidence))
        self.assertEqual(self.task["id"], evidence[0]["scope"]["task_id"])
        self.assertEqual(45, evidence[0]["structured_value"]["values"]["task_remaining_minutes"])
        self.assertEqual(before, self.store.get_profile("u")["learned_patterns"])

    def test_reentry_prompt_is_audit_only_and_adds_no_evidence(self) -> None:
        self.store.save_context_dump("u", {
            "task_id": self.task["id"], "request_id": "dump-request-2",
            "progress": "outline complete", "next_action": "draft findings",
            "stop_reason": "break",
        })
        before = self.store.list_personalization_evidence("u")
        result = self.store.reentry_prompt("u", {
            "task_id": self.task["id"],
            "runtime_state": {"focus": 5, "energy": 4, "stress": 3},
        })
        after = self.store.list_personalization_evidence("u")
        self.assertEqual("draft findings", result["first_step"])
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
