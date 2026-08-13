"""SQLite persistence operations for Task aggregates."""

from __future__ import annotations

import sqlite3


class TaskRepository:
    """Task persistence bound to a caller-owned transaction."""

    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def active_for_week(self, *, user_id: str, week_id: str) -> list[sqlite3.Row]:
        return self.connection.execute(
            "SELECT * FROM tasks WHERE user_id=? AND week_id=? AND removed_from_week=0 AND status NOT IN ('completed','terminated')",
            (user_id, week_id),
        ).fetchall()

    def save_schedule_projection(
        self,
        *,
        task_id: str,
        user_id: str,
        slot_json: str,
        execution_json: str,
        status: str,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "UPDATE tasks SET slot_json=?,execution_json=?,status=?,updated_at=? WHERE id=? AND user_id=?",
            (slot_json, execution_json, status, timestamp, task_id, user_id),
        )

    def save_execution_state(
        self,
        *,
        task_id: str,
        user_id: str,
        execution_json: str,
        status: str,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "UPDATE tasks SET status=?,execution_json=?,updated_at=? WHERE id=? AND user_id=?",
            (status, execution_json, timestamp, task_id, user_id),
        )
