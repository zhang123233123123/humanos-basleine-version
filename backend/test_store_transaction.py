import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from backend.humanos_server import Store


class StoreTransactionTests(unittest.TestCase):
    def test_nested_connect_rolls_back_with_outer_atomic_scope(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / "test.db")
            with self.assertRaises(RuntimeError):
                with store.atomic():
                    with store.connect() as conn:
                        conn.execute("INSERT INTO events (id,user_id,type,payload_json,created_at) VALUES (?,?,?,?,?)", ("event-rollback", "u", "test", "{}", 1))
                    raise RuntimeError("rollback")
            with closing(sqlite3.connect(store.path)) as conn:
                count = conn.execute("SELECT COUNT(*) FROM events WHERE id='event-rollback'").fetchone()[0]
            self.assertEqual(0, count)

    def test_nested_connect_commits_once_with_outer_atomic_scope(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / "test.db")
            with store.atomic():
                with store.connect() as conn:
                    conn.execute("INSERT INTO events (id,user_id,type,payload_json,created_at) VALUES (?,?,?,?,?)", ("event-commit", "u", "test", "{}", 1))
            with closing(sqlite3.connect(store.path)) as conn:
                count = conn.execute("SELECT COUNT(*) FROM events WHERE id='event-commit'").fetchone()[0]
            self.assertEqual(1, count)


if __name__ == "__main__":
    unittest.main()
