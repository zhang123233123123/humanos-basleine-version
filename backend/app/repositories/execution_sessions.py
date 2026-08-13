"""SQLite persistence operations for execution session lifecycle."""

from __future__ import annotations

import sqlite3


class ExecutionSessionRepository:
    """Execution Session persistence bound to a caller-owned transaction."""

    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def latest_paused_for_task(self, *, user_id: str, task_id: str) -> sqlite3.Row | None:
        return self.connection.execute(
            "SELECT id FROM execution_sessions WHERE user_id=? AND task_id=? AND status='paused' ORDER BY updated_at DESC LIMIT 1",
            (user_id, task_id),
        ).fetchone()

    def upsert_ready(
        self,
        *,
        execution_id: str,
        user_id: str,
        task_id: str,
        block_id: str,
        week_id: str,
        revision: int,
        planned_start_at: str,
        planned_end_at: str,
        planned_work_minutes: int,
        resumed_from_session_id: str | None,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "INSERT INTO execution_sessions (id,user_id,task_id,block_id,week_id,plan_revision,planned_start_at,planned_end_at,planned_work_minutes,resumed_from_session_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,block_id,plan_revision) DO UPDATE SET planned_start_at=excluded.planned_start_at,planned_end_at=excluded.planned_end_at,planned_work_minutes=excluded.planned_work_minutes,resumed_from_session_id=excluded.resumed_from_session_id,updated_at=excluded.updated_at",
            (
                execution_id, user_id, task_id, block_id, week_id, revision,
                planned_start_at, planned_end_at, planned_work_minutes,
                resumed_from_session_id, "ready", timestamp, timestamp,
            ),
        )

    def mark_continued_in_revision(self, *, session_id: str, timestamp: int) -> None:
        self.connection.execute(
            "UPDATE execution_sessions SET status='superseded',completion_outcome='continued_in_revision',updated_at=? WHERE id=?",
            (timestamp, session_id),
        )

    def supersede_older_future_sessions(
        self,
        *,
        user_id: str,
        week_id: str,
        active_revision: int,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "UPDATE execution_sessions SET status='superseded',completion_outcome=CASE WHEN status='paused' THEN 'replaced_by_revision' ELSE completion_outcome END,updated_at=? WHERE user_id=? AND week_id=? AND plan_revision<>? AND status IN ('ready','paused')",
            (timestamp, user_id, week_id, active_revision),
        )
