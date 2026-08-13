"""SQLite persistence operations for plan revisions."""

from __future__ import annotations

import sqlite3
from typing import Any


class PlanRepository:
    """Plan persistence bound to a caller-owned transaction."""

    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def get_for_user(self, *, plan_id: str, user_id: str) -> sqlite3.Row | None:
        return self.connection.execute(
            "SELECT * FROM plans WHERE id=? AND user_id=?",
            (plan_id, user_id),
        ).fetchone()

    def next_revision(self, *, user_id: str, week_id: str) -> int:
        row = self.connection.execute(
            "SELECT COALESCE(MAX(plan_revision),0) AS revision FROM plans WHERE user_id=? AND week_id=?",
            (user_id, week_id),
        ).fetchone()
        return int(row["revision"] or 0) + 1

    def insert_proposed(
        self,
        *,
        plan_id: str,
        user_id: str,
        week_id: str,
        revision: int,
        request_id: str | None,
        plan_json: str,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "INSERT INTO plans (id,user_id,week_id,plan_revision,plan_status,request_id,plan_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (plan_id, user_id, week_id, revision, "proposed", request_id, plan_json, timestamp, timestamp),
        )

    def supersede_other_revisions(
        self,
        *,
        user_id: str,
        week_id: str,
        active_plan_id: str,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "UPDATE plans SET plan_status='superseded',updated_at=? WHERE user_id=? AND week_id=? AND id<>? AND plan_status IN ('confirmed','needs_update','proposed')",
            (timestamp, user_id, week_id, active_plan_id),
        )

    def confirm(
        self,
        *,
        plan_id: str,
        user_id: str,
        plan_json: str,
        timestamp: int,
    ) -> None:
        self.connection.execute(
            "UPDATE plans SET plan_status='confirmed',plan_json=?,confirmed_at=?,updated_at=? WHERE id=? AND user_id=?",
            (plan_json, timestamp, timestamp, plan_id, user_id),
        )
