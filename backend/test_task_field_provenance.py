import tempfile
import unittest
from pathlib import Path

from backend.app.application.task_payloads import build_task_previews
from backend.humanos_server import Store


class TaskFieldProvenanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = Store(Path(self.temp.name) / "provenance.db")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_direct_creation_marks_supplied_fields_as_user_input(self) -> None:
        task = self.store.create_task("u", {"title": "Write", "duration": 45, "priority": "high"})
        self.assertEqual("user_input", task["field_provenance"]["title"]["source"])
        self.assertEqual("user_input", task["field_provenance"]["duration"]["source"])

    def test_ai_preview_provenance_survives_confirmation_and_user_edit(self) -> None:
        preview = build_task_previews([{
            "title": "Analyze interviews", "task_type": "flexible_task",
            "due": "2026-08-24T18:00:00+08:00", "duration": 60,
            "priority": "high", "context": "Analyze interviews", "confidence": 0.82,
        }], parser_name="pydantic_ai", preview_id=lambda _index: "preview-1")[0]
        task = self.store.create_task("u", preview)
        self.assertEqual("ai_extracted", task["field_provenance"]["title"]["source"])
        self.assertAlmostEqual(0.82, task["field_provenance"]["title"]["confidence"])

        edited = self.store.patch_task(task["id"], {
            "title": "Analyze interview transcripts",
            "_provenance_source": "user_input",
            "_provenance_source_id": "task_api",
        }, "u")
        self.assertEqual("user_input", edited["field_provenance"]["title"]["source"])
        self.assertEqual("ai_extracted", edited["field_provenance"]["duration"]["source"])

    def test_old_row_without_metadata_is_reported_as_legacy_not_user_input(self) -> None:
        task = self.store.create_task("u", {"title": "Existing", "duration": 30})
        with self.store.connect() as conn:
            conn.execute("UPDATE tasks SET field_provenance_json='{}' WHERE id=?", (task["id"],))
        loaded = self.store.get_task(task["id"], "u")
        self.assertEqual("legacy_persisted", loaded["field_provenance"]["title"]["source"])
        self.assertEqual("legacy_persisted", loaded["field_provenance"]["duration"]["source"])

    def test_backend_defaults_do_not_masquerade_as_user_fields(self) -> None:
        task = self.store.create_task("u", {"title": "Deadline only", "due": "2026-08-24T18:00:00+08:00"})
        self.assertEqual("user_input", task["field_provenance"]["deadline"]["source"])
        self.assertEqual("system_derived", task["field_provenance"]["duration"]["source"])
        self.assertEqual("system_derived", task["field_provenance"]["status"]["source"])


if __name__ == "__main__":
    unittest.main()
