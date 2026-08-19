import tempfile
import unittest
from pathlib import Path

from backend.humanos_server import Store


class TaskCreationContractTests(unittest.TestCase):
    def test_fixed_event_requires_an_explicit_start(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "fixed.db")
            with self.assertRaisesRegex(ValueError, "fixed_event requires startAt"):
                store.create_task("u", {
                    "title": "Sleep", "task_type": "fixed_event",
                    "due": "2026-08-22T23:00:00+08:00", "duration": 45,
                })

    def test_fixed_event_keeps_explicit_start_separate_from_deadline(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
            store = Store(Path(temp_dir) / "fixed-start.db")
            task = store.create_task("u", {
                "title": "Seminar", "task_type": "fixed_event",
                "start_at": "2026-08-20T10:00:00+08:00", "duration": 60,
            })
        self.assertEqual("fixed_event", task["task_type"])
        self.assertEqual("2026-08-20T10:00:00+08:00", task["start_at"])


if __name__ == "__main__":
    unittest.main()
