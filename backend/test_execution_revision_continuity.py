import sqlite3
import unittest

from backend.app.repositories.execution_sessions import ExecutionSessionRepository


class ExecutionRevisionContinuityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.connection = sqlite3.connect(":memory:")
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("""CREATE TABLE execution_sessions (
          id TEXT PRIMARY KEY,user_id TEXT,task_id TEXT,block_id TEXT,week_id TEXT,plan_revision INTEGER,
          planned_start_at TEXT,planned_end_at TEXT,planned_work_minutes INTEGER,resumed_from_session_id TEXT,
          accumulated_active_minutes INTEGER DEFAULT 0,remaining_at_pause INTEGER,interruption_snapshot_json TEXT,
          status TEXT,completion_outcome TEXT,created_at INTEGER,updated_at INTEGER,
          UNIQUE(user_id,block_id,plan_revision))""")
        self.repository = ExecutionSessionRepository(self.connection)

    def test_new_revision_inherits_paused_execution_context(self) -> None:
        self.connection.execute("INSERT INTO execution_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ("old", "u", "task", "old-block", "2026-08-10", 1, "a", "b", 60, None, 20, 40, '{"next_step":"continue"}', "paused", None, 1, 2))
        source = self.repository.latest_paused_for_task(user_id="u", task_id="task")
        self.repository.upsert_ready(execution_id="new", user_id="u", task_id="task", block_id="new-block", week_id="2026-08-10", revision=2, planned_start_at="c", planned_end_at="d", planned_work_minutes=40, resumed_from_session_id=source["id"], accumulated_active_minutes=source["accumulated_active_minutes"], remaining_at_pause=source["remaining_at_pause"], interruption_snapshot_json=source["interruption_snapshot_json"], timestamp=3)
        row = self.connection.execute("SELECT * FROM execution_sessions WHERE id='new'").fetchone()
        self.assertEqual(("old", 20, 40, '{"next_step":"continue"}', "ready"), (row["resumed_from_session_id"], row["accumulated_active_minutes"], row["remaining_at_pause"], row["interruption_snapshot_json"], row["status"]))


if __name__ == "__main__":
    unittest.main()
